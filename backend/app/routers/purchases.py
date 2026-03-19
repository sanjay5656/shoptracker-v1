from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.models.models import Purchase, Stock, Category

router = APIRouter(prefix="/purchases", tags=["Purchases"])
IST = timezone(timedelta(hours=5, minutes=30))
def ist_now(): return datetime.now(IST).replace(tzinfo=None)

class PurchaseCreate(BaseModel):
    category_id: int
    quantity_bought: int
    total_paid: float
    supplier_name: Optional[str] = None

@router.post("/")
def record_purchase(purchase: PurchaseCreate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == purchase.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail=f"Category {purchase.category_id} not found")
    if purchase.quantity_bought <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    if purchase.total_paid <= 0:
        raise HTTPException(status_code=400, detail="Total paid must be greater than 0")
    cost_per_piece = purchase.total_paid / purchase.quantity_bought
    new_purchase = Purchase(
        category_id=purchase.category_id,
        quantity_bought=purchase.quantity_bought,
        total_paid=purchase.total_paid,
        cost_per_piece=cost_per_piece,
        supplier_name=purchase.supplier_name
    )
    db.add(new_purchase)
    stock = db.query(Stock).filter(Stock.category_id == purchase.category_id).first()
    if stock:
        old_total_value   = stock.quantity * stock.avg_cost
        combined_quantity = stock.quantity + purchase.quantity_bought
        combined_value    = old_total_value + purchase.total_paid
        stock.quantity    = combined_quantity
        stock.avg_cost    = combined_value / combined_quantity
        stock.last_updated = ist_now()
    else:
        stock = Stock(category_id=purchase.category_id, quantity=purchase.quantity_bought, avg_cost=cost_per_piece)
        db.add(stock)
    db.commit()
    db.refresh(new_purchase)
    return {
        "message": "Purchase recorded successfully",
        "purchase": {
            "id": new_purchase.id, "category": category.name,
            "quantity_bought": new_purchase.quantity_bought,
            "total_paid": new_purchase.total_paid,
            "cost_per_piece": round(cost_per_piece, 2),
            "supplier_name": new_purchase.supplier_name,
            "purchase_date": new_purchase.purchase_date
        },
        "stock_update": {"new_quantity": stock.quantity, "new_avg_cost": round(stock.avg_cost, 2)}
    }

@router.get("/")
def get_all_purchases(db: Session = Depends(get_db)):
    purchases = db.query(Purchase).order_by(Purchase.purchase_date.desc()).all()
    if not purchases:
        return {"message": "No purchases recorded yet", "purchases": []}
    result = []
    for p in purchases:
        category = db.query(Category).filter(Category.id == p.category_id).first()
        result.append({
            "id": p.id, "category": category.name if category else "Unknown",
            "quantity_bought": p.quantity_bought, "total_paid": p.total_paid,
            "cost_per_piece": round(p.cost_per_piece, 2),
            "supplier_name": p.supplier_name, "purchase_date": p.purchase_date
        })
    return {"total_purchases": len(result), "purchases": result}
