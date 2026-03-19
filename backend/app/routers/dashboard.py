from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app.models.models import Sale, Purchase, Stock, Category

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])
IST = timezone(timedelta(hours=5, minutes=30))

def ist_today_range():
    now = datetime.now(IST).replace(tzinfo=None)
    return now.replace(hour=0,minute=0,second=0,microsecond=0), now.replace(hour=23,minute=59,second=59,microsecond=999999)

def ist_month_range():
    now = datetime.now(IST).replace(tzinfo=None)
    return now.replace(day=1,hour=0,minute=0,second=0,microsecond=0), now.replace(hour=23,minute=59,second=59,microsecond=999999)

@router.get("/today")
def get_today_summary(db: Session = Depends(get_db)):
    start, end = ist_today_range()
    sales = db.query(Sale).filter(Sale.sale_datetime >= start, Sale.sale_datetime <= end).all()
    return {"date": datetime.now(IST).strftime("%Y-%m-%d"), "sales_summary": {
        "total_revenue": round(sum(s.actual_price*s.quantity_sold for s in sales),2),
        "total_profit": round(sum(s.profit for s in sales),2),
        "total_bargain_loss": round(sum(s.bargain_loss for s in sales),2),
        "total_items_sold": sum(s.quantity_sold for s in sales),
        "total_sales_count": len(sales)}}

@router.get("/month")
def get_month_summary(db: Session = Depends(get_db)):
    start, end = ist_month_range()
    now = datetime.now(IST).replace(tzinfo=None)
    sales = db.query(Sale).filter(Sale.sale_datetime >= start, Sale.sale_datetime <= end).all()
    daily_profit = {}
    for s in sales:
        d = str(s.sale_datetime.date())
        daily_profit[d] = daily_profit.get(d,0) + s.profit
    best_day = max(daily_profit, key=daily_profit.get) if daily_profit else None
    return {"month": now.strftime("%B %Y"), "summary": {
        "total_revenue": round(sum(s.actual_price*s.quantity_sold for s in sales),2),
        "total_profit": round(sum(s.profit for s in sales),2),
        "total_bargain_loss": round(sum(s.bargain_loss for s in sales),2),
        "total_items_sold": sum(s.quantity_sold for s in sales)},
        "best_day": {"date": best_day, "profit": round(daily_profit[best_day],2)} if best_day else None}

@router.get("/stock-alerts")
def get_stock_alerts(db: Session = Depends(get_db)):
    out, low, healthy = [], [], []
    for stock in db.query(Stock).all():
        cat = db.query(Category).filter(Category.id == stock.category_id).first()
        if not cat: continue
        item = {"category": cat.name, "current_stock": stock.quantity, "avg_cost": round(stock.avg_cost,2)}
        if stock.quantity == 0: out.append(item)
        elif stock.quantity <= 10: low.append(item)
        else: healthy.append(item)
    return {"alerts": {"out_of_stock": {"count":len(out),"categories":out},
        "low_stock": {"count":len(low),"categories":low},
        "healthy": {"count":len(healthy),"categories":healthy}}}

@router.get("/top-categories")
def get_top_categories(db: Session = Depends(get_db)):
    result = []
    for cat in db.query(Category).all():
        cat_sales = db.query(Sale).filter(Sale.category_id == cat.id).all()
        stock = db.query(Stock).filter(Stock.category_id == cat.id).first()
        result.append({"category": cat.name,
            "total_revenue": round(sum(s.actual_price*s.quantity_sold for s in cat_sales),2),
            "total_profit": round(sum(s.profit for s in cat_sales),2),
            "total_bargain_loss": round(sum(s.bargain_loss for s in cat_sales),2),
            "total_items_sold": sum(s.quantity_sold for s in cat_sales),
            "current_stock": stock.quantity if stock else 0})
    result.sort(key=lambda x: x["total_profit"], reverse=True)
    return {"top_categories": result}
