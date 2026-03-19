from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone, timedelta
from app.database import Base

IST = timezone(timedelta(hours=5, minutes=30))

def ist_now():
    return datetime.now(IST).replace(tzinfo=None)

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    selling_price = Column(Float, nullable=True, default=0.0)
    created_at = Column(DateTime, default=ist_now)

class Purchase(Base):
    __tablename__ = "purchases"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    quantity_bought = Column(Integer, nullable=False)
    total_paid = Column(Float, nullable=False)
    cost_per_piece = Column(Float)
    supplier_name = Column(String, nullable=True)
    purchase_date = Column(DateTime, default=ist_now)

class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    quantity_sold = Column(Integer, nullable=False)
    original_price = Column(Float, nullable=False)
    actual_price = Column(Float, nullable=False)
    cost_per_piece = Column(Float, nullable=False)
    profit = Column(Float, nullable=False)
    bargain_loss = Column(Float, nullable=False)
    sale_datetime = Column(DateTime, default=ist_now)

class Stock(Base):
    __tablename__ = "stock"
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), unique=True, nullable=False)
    quantity = Column(Integer, default=0)
    avg_cost = Column(Float, default=0.0)
    last_updated = Column(DateTime, default=ist_now)
