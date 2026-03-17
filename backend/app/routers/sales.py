# sales.py
# Handles recording sales to customers
# Contains the UNIQUE feature: bargain price tracking
#
# API Endpoints:
# POST /sales/                        → Record a new sale
# GET  /sales/                        → Get sales by date
# GET  /sales/history?from=&to=       → Get sales between dates

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.models import Sale, Stock, Category, Purchase

router = APIRouter(prefix="/sales", tags=["Sales"])

# ─────────────────────────────────────────
# PYDANTIC VALIDATOR
# ─────────────────────────────────────────
# category_id    → which category was sold
# quantity_sold  → how many pieces
# original_price → price we WANTED per piece
# actual_price   → price we ACTUALLY got per piece

class SaleCreate(BaseModel):
    category_id: int
    quantity_sold: int
    original_price: float
    actual_price: float

# ─────────────────────────────────────────
# ENDPOINT 1: RECORD SALE
# ─────────────────────────────────────────
# POST /sales/
# Called when shop owner records a sale

@router.post("/")
def record_sale(sale: SaleCreate, db: Session = Depends(get_db)):

    # Step 1: Verify category exists
    category = db.query(Category).filter(
        Category.id == sale.category_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=404,
            detail=f"Category {sale.category_id} not found"
        )

    # Step 2: Validate numbers
    if sale.quantity_sold <= 0:
        raise HTTPException(
            status_code=400,
            detail="Quantity sold must be greater than 0"
        )

    if sale.actual_price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Actual price must be greater than 0"
        )

    if sale.original_price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Original price must be greater than 0"
        )

    # Step 3: Check stock availability
    # Can't sell what you don't have!
    stock = db.query(Stock).filter(
        Stock.category_id == sale.category_id
    ).first()

    if not stock:
        raise HTTPException(
            status_code=404,
            detail="No stock found for this category. Record a purchase first."
        )

    if stock.quantity < sale.quantity_sold:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough stock. Available: {stock.quantity} pieces only"
        )

    # Step 4: Calculate profit and bargain loss
    #
    # PROFIT CALCULATION:
    # profit = (actual_price - cost_per_piece) × quantity_sold
    # Example: (₹50 - ₹16) × 2 = ₹68 profit
    #
    # We use stock.avg_cost as cost_per_piece
    # This is the weighted average cost of all purchases
    # It's the most accurate cost we have

    profit = (sale.actual_price - stock.avg_cost) * sale.quantity_sold

    # BARGAIN LOSS CALCULATION:
    # bargain_loss = (original_price - actual_price) × quantity_sold
    # Example: (₹60 - ₹50) × 2 = ₹20 lost to bargaining
    #
    # If original_price == actual_price → no bargaining happened
    # bargain_loss = 0
    #
    # THIS IS THE UNIQUE FEATURE — NO OTHER APP TRACKS THIS

    bargain_loss = (sale.original_price - sale.actual_price) * sale.quantity_sold

    # Step 5: Save the sale record
    new_sale = Sale(
        category_id=sale.category_id,
        quantity_sold=sale.quantity_sold,
        original_price=sale.original_price,
        actual_price=sale.actual_price,
        cost_per_piece=stock.avg_cost,
        profit=profit,
        bargain_loss=bargain_loss
    )
    db.add(new_sale)

    # Step 6: Reduce stock quantity
    # Stock goes down when something is sold
    stock.quantity -= sale.quantity_sold
    stock.last_updated = datetime.utcnow()

    # Save everything
    db.commit()
    db.refresh(new_sale)

    return {
        "message": "Sale recorded successfully",
        "sale": {
            "id": new_sale.id,
            "category": category.name,
            "quantity_sold": new_sale.quantity_sold,
            "original_price": new_sale.original_price,
            "actual_price": new_sale.actual_price,
            "cost_per_piece": round(new_sale.cost_per_piece, 2),
            "sale_datetime": new_sale.sale_datetime
        },
        "profit_summary": {
            "profit_made": round(profit, 2),
            "bargain_loss": round(bargain_loss, 2)
        },
        "stock_update": {
            "remaining_stock": stock.quantity
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 2: GET SALES BY DATE
# ─────────────────────────────────────────
# GET /sales/?date=2026-03-17
# Returns all sales for a specific date
# Default: today's sales
# Used by: Dashboard today screen, sold items modal

@router.get("/")
def get_sales_by_date(date: str = None, db: Session = Depends(get_db)):

    # If no date given, use today
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")

    try:
        target = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        target = datetime.utcnow().date()

    # Get all sales from start to end of that day
    start = datetime.combine(target, datetime.min.time())
    end   = datetime.combine(target, datetime.max.time())

    sales = db.query(Sale).filter(
        Sale.sale_datetime >= start,
        Sale.sale_datetime <= end
    ).all()

    result = []
    for s in sales:
        cat = db.query(Category).filter(
            Category.id == s.category_id
        ).first()

        result.append({
            "id": s.id,
            "category_id": s.category_id,
            "category_name": cat.name if cat else "Unknown",
            "quantity_sold": s.quantity_sold,
            "original_price": s.original_price,
            "actual_price": s.actual_price,
            "cost_per_piece": round(s.cost_per_piece, 2),
            "profit": round(s.profit, 2),
            "bargain_loss": round(s.bargain_loss, 2),
            "sale_datetime": s.sale_datetime
        })

    return {
        "date": str(target),
        "sales": result,
        "summary": {
            "total_revenue":      round(sum(s["actual_price"] * s["quantity_sold"] for s in result), 2),
            "total_profit":       round(sum(s["profit"] for s in result), 2),
            "total_bargain_loss": round(sum(s["bargain_loss"] for s in result), 2),
            "total_items_sold":   sum(s["quantity_sold"] for s in result)
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 3: GET SALES HISTORY
# ─────────────────────────────────────────
# GET /sales/history?from_date=2026-03-01&to_date=2026-03-17
# Returns sales AND purchases between two dates
# Used by: History screen

@router.get("/history")
def get_sales_history(from_date: str, to_date: str, db: Session = Depends(get_db)):

    try:
        start = datetime.strptime(from_date, "%Y-%m-%d")
        end   = datetime.combine(
            datetime.strptime(to_date, "%Y-%m-%d").date(),
            datetime.max.time()
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use YYYY-MM-DD"
        )

    sales     = db.query(Sale).filter(
        Sale.sale_datetime >= start,
        Sale.sale_datetime <= end
    ).order_by(Sale.sale_datetime.desc()).all()

    purchases = db.query(Purchase).filter(
        Purchase.purchase_date >= start,
        Purchase.purchase_date <= end
    ).order_by(Purchase.purchase_date.desc()).all()

    sale_result = []
    for s in sales:
        cat = db.query(Category).filter(Category.id == s.category_id).first()
        sale_result.append({
            "id": s.id,
            "category_id": s.category_id,
            "category_name": cat.name if cat else "Unknown",
            "quantity_sold": s.quantity_sold,
            "original_price": s.original_price,
            "actual_price": s.actual_price,
            "cost_per_piece": round(s.cost_per_piece, 2),
            "profit": round(s.profit, 2),
            "bargain_loss": round(s.bargain_loss, 2),
            "sale_datetime": s.sale_datetime
        })

    pur_result = []
    for p in purchases:
        cat = db.query(Category).filter(Category.id == p.category_id).first()
        pur_result.append({
            "id": p.id,
            "category_id": p.category_id,
            "category_name": cat.name if cat else "Unknown",
            "quantity_bought": p.quantity_bought,
            "total_paid": p.total_paid,
            "cost_per_piece": round(p.cost_per_piece, 2),
            "supplier_name": p.supplier_name,
            "purchase_date": p.purchase_date
        })

    return {
        "from_date": from_date,
        "to_date": to_date,
        "sales": sale_result,
        "purchases": pur_result,
        "summary": {
            "total_revenue":      round(sum(s["actual_price"] * s["quantity_sold"] for s in sale_result), 2),
            "total_profit":       round(sum(s["profit"] for s in sale_result), 2),
            "total_bargain_loss": round(sum(s["bargain_loss"] for s in sale_result), 2),
            "total_items_sold":   sum(s["quantity_sold"] for s in sale_result),
            "total_spent":        round(sum(p["total_paid"] for p in pur_result), 2)
        }
    }
