# purchases.py
# Handles recording wholesale purchases from suppliers
#
# API Endpoints:
# POST /purchases/  → Record a new purchase
# GET  /purchases/  → Get all purchases

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.database import get_db
from app.models.models import Purchase, Stock, Category

router = APIRouter(prefix="/purchases", tags=["Purchases"])

# ─────────────────────────────────────────
# PYDANTIC VALIDATOR
# ─────────────────────────────────────────
# Defines what data we expect when recording a purchase
# category_id   → which category (Earrings=1, Bangles=2 etc)
# quantity_bought → how many pieces bought
# total_paid    → total money paid to supplier
# supplier_name → optional: who did we buy from

class PurchaseCreate(BaseModel):
    category_id: int
    quantity_bought: int
    total_paid: float
    supplier_name: Optional[str] = None

# ─────────────────────────────────────────
# ENDPOINT 1: RECORD PURCHASE
# ─────────────────────────────────────────
# POST /purchases/
# Called when shop owner records a wholesale purchase

@router.post("/")
def record_purchase(purchase: PurchaseCreate, db: Session = Depends(get_db)):

    # Step 1: Verify the category exists
    # Can't record purchase for a category that doesn't exist
    category = db.query(Category).filter(
        Category.id == purchase.category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail=f"Category {purchase.category_id} not found"
        )

    # Step 2: Validate the numbers make sense
    if purchase.quantity_bought <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be greater than 0"
        )

    if purchase.total_paid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Total paid must be greater than 0"
        )

    # Step 3: Calculate cost per piece automatically
    # This is never entered manually — always calculated
    # Example: paid ₹800 for 50 pieces = ₹16 per piece
    cost_per_piece = purchase.total_paid / purchase.quantity_bought

    # Step 4: Save the purchase record
    new_purchase = Purchase(
        category_id=purchase.category_id,
        quantity_bought=purchase.quantity_bought,
        total_paid=purchase.total_paid,
        cost_per_piece=cost_per_piece,
        supplier_name=purchase.supplier_name
    )
    db.add(new_purchase)

    # Step 5: Update stock using weighted average cost
    # This is the smart part — explained above
    stock = db.query(Stock).filter(
        Stock.category_id == purchase.category_id
    ).first()

    if stock:
        # Stock exists — update quantity and recalculate avg_cost
        #
        # Weighted average formula:
        # new_avg = (old_qty × old_avg + new_qty × new_cost)
        #           / (old_qty + new_qty)
        #
        # Example:
        # Had: 50 pieces at avg ₹16 = total value ₹800
        # Bought: 30 more at ₹20 = value ₹600
        # Combined: 80 pieces, total value ₹1400
        # New avg = 1400/80 = ₹17.5

        old_total_value = stock.quantity * stock.avg_cost
        new_total_value = purchase.total_paid
        combined_quantity = stock.quantity + purchase.quantity_bought
        combined_value = old_total_value + new_total_value

        stock.quantity = combined_quantity
        stock.avg_cost = combined_value / combined_quantity
        stock.last_updated = datetime.utcnow()
    else:
        # No stock record yet — create one
        # This shouldn't happen normally (categories.py creates stock)
        # But we handle it just in case
        stock = Stock(
            category_id=purchase.category_id,
            quantity=purchase.quantity_bought,
            avg_cost=cost_per_piece
        )
        db.add(stock)

    # Save everything to database
    db.commit()
    db.refresh(new_purchase)

    return {
        "message": "Purchase recorded successfully",
        "purchase": {
            "id": new_purchase.id,
            "category": category.name,
            "quantity_bought": new_purchase.quantity_bought,
            "total_paid": new_purchase.total_paid,
            "cost_per_piece": round(cost_per_piece, 2),
            "supplier_name": new_purchase.supplier_name,
            "purchase_date": new_purchase.purchase_date
        },
        "stock_update": {
            "new_quantity": stock.quantity,
            "new_avg_cost": round(stock.avg_cost, 2)
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 2: GET ALL PURCHASES
# ─────────────────────────────────────────
# GET /purchases/
# Returns all purchase history
# Used by: History screen

@router.get("/")
def get_all_purchases(db: Session = Depends(get_db)):

    # order_by desc → newest purchases first
    purchases = db.query(Purchase).order_by(
        Purchase.purchase_date.desc()
    ).all()

    if not purchases:
        return {"message": "No purchases recorded yet", "purchases": []}

    result = []
    for p in purchases:
        category = db.query(Category).filter(
            Category.id == p.category_id
        ).first()

        result.append({
            "id": p.id,
            "category": category.name if category else "Unknown",
            "quantity_bought": p.quantity_bought,
            "total_paid": p.total_paid,
            "cost_per_piece": round(p.cost_per_piece, 2),
            "supplier_name": p.supplier_name,
            "purchase_date": p.purchase_date
        })

    return {
        "total_purchases": len(result),
        "purchases": result
    }
