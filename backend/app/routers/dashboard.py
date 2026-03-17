# dashboard.py
# Powers the SEE screen — the business intelligence dashboard
# This is what your mother checks at end of every day
#
# API Endpoints:
# GET /dashboard/today         → Today's sales summary
# GET /dashboard/month         → This month's summary
# GET /dashboard/stock-alerts  → Low stock warnings
# GET /dashboard/top-categories → Best performing categories

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date
from app.database import get_db
from app.models.models import Sale, Purchase, Stock, Category

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# ─────────────────────────────────────────
# ENDPOINT 1: TODAY'S SUMMARY
# ─────────────────────────────────────────
# GET /dashboard/today
# The most important endpoint — checked every evening
# Shows: revenue, profit, bargain loss, items sold today

@router.get("/today")
def get_today_summary(db: Session = Depends(get_db)):

    today = date.today()
    start = datetime.combine(today, datetime.min.time())
    end   = datetime.combine(today, datetime.max.time())

    # Get all sales that happened today
    sales = db.query(Sale).filter(
        Sale.sale_datetime >= start,
        Sale.sale_datetime <= end
    ).all()

    # Calculate totals from today's sales
    total_revenue = sum(s.actual_price * s.quantity_sold for s in sales)
    total_profit  = sum(s.profit for s in sales)
    total_bargain = sum(s.bargain_loss for s in sales)
    total_items   = sum(s.quantity_sold for s in sales)

    return {
        "date": str(today),
        "sales_summary": {
            "total_revenue":      round(total_revenue, 2),
            "total_profit":       round(total_profit, 2),
            "total_bargain_loss": round(total_bargain, 2),
            "total_items_sold":   total_items,
            "total_sales_count":  len(sales)
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 2: THIS MONTH'S SUMMARY
# ─────────────────────────────────────────
# GET /dashboard/month
# Shows monthly performance
# Includes: best day of the month

@router.get("/month")
def get_month_summary(db: Session = Depends(get_db)):

    today     = date.today()
    # First day of current month at midnight
    first_day = datetime(today.year, today.month, 1)
    # End of today
    last_day  = datetime.combine(today, datetime.max.time())

    sales = db.query(Sale).filter(
        Sale.sale_datetime >= first_day,
        Sale.sale_datetime <= last_day
    ).all()

    total_revenue = sum(s.actual_price * s.quantity_sold for s in sales)
    total_profit  = sum(s.profit for s in sales)
    total_bargain = sum(s.bargain_loss for s in sales)
    total_items   = sum(s.quantity_sold for s in sales)

    # Find the best day this month
    # Group profits by date, find which date had most profit
    daily_profit = {}
    for s in sales:
        d = str(s.sale_datetime.date())
        daily_profit[d] = daily_profit.get(d, 0) + s.profit

    best_day = max(daily_profit, key=daily_profit.get) if daily_profit else None

    return {
        "month": today.strftime("%B %Y"),
        "summary": {
            "total_revenue":      round(total_revenue, 2),
            "total_profit":       round(total_profit, 2),
            "total_bargain_loss": round(total_bargain, 2),
            "total_items_sold":   total_items
        },
        "best_day": {
            "date": best_day,
            "profit": round(daily_profit[best_day], 2)
        } if best_day else None
    }

# ─────────────────────────────────────────
# ENDPOINT 3: STOCK ALERTS
# ─────────────────────────────────────────
# GET /dashboard/stock-alerts
# Shows which categories are running low or out of stock
# Helps your mother know what to buy next time she goes
# to the wholesale market
#
# Three levels:
# out_of_stock → quantity = 0 (🔴 must buy now)
# low_stock    → quantity <= 10 (🟡 buy soon)
# healthy      → quantity > 10 (🟢 fine)

@router.get("/stock-alerts")
def get_stock_alerts(db: Session = Depends(get_db)):

    all_stocks = db.query(Stock).all()
    out, low, healthy = [], [], []

    for stock in all_stocks:
        cat = db.query(Category).filter(
            Category.id == stock.category_id
        ).first()

        if not cat:
            continue

        item = {
            "category": cat.name,
            "current_stock": stock.quantity,
            "avg_cost": round(stock.avg_cost, 2)
        }

        if stock.quantity == 0:
            out.append(item)
        elif stock.quantity <= 10:
            low.append(item)
        else:
            healthy.append(item)

    return {
        "alerts": {
            "out_of_stock": {
                "count": len(out),
                "categories": out
            },
            "low_stock": {
                "count": len(low),
                "categories": low
            },
            "healthy": {
                "count": len(healthy),
                "categories": healthy
            }
        }
    }

# ─────────────────────────────────────────
# ENDPOINT 4: TOP CATEGORIES
# ─────────────────────────────────────────
# GET /dashboard/top-categories
# Shows which categories make the most profit
# Helps your mother decide what to stock more of
# Example: "Earrings make ₹3000 profit, Toys only ₹500
#           → Buy more earrings next time"

@router.get("/top-categories")
def get_top_categories(db: Session = Depends(get_db)):

    categories = db.query(Category).all()
    result = []

    for cat in categories:
        # Get all sales for this category (all time)
        cat_sales = db.query(Sale).filter(
            Sale.category_id == cat.id
        ).all()

        stock = db.query(Stock).filter(
            Stock.category_id == cat.id
        ).first()

        result.append({
            "category":           cat.name,
            "total_revenue":      round(sum(s.actual_price * s.quantity_sold for s in cat_sales), 2),
            "total_profit":       round(sum(s.profit for s in cat_sales), 2),
            "total_bargain_loss": round(sum(s.bargain_loss for s in cat_sales), 2),
            "total_items_sold":   sum(s.quantity_sold for s in cat_sales),
            "current_stock":      stock.quantity if stock else 0
        })

    # Sort by total profit — highest profit category first
    result.sort(key=lambda x: x["total_profit"], reverse=True)

    return {"top_categories": result}
