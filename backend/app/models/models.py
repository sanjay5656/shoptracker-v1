# models.py
# This file defines our 4 database tables
# Each class = one table in the database
# Each variable inside = one column in that table

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

# ─────────────────────────────────────────
# TABLE 1: CATEGORIES
# ─────────────────────────────────────────
# Stores the types of products in the shop
# Examples: Earrings, Bangles, Hair Clips, Toys, Stationery
#
# Why category-based and not product-based?
# A shop has 500+ products. Tracking each is impossible.
# Categories give 80% insight with 1% effort.

class Category(Base):
    __tablename__ = "categories"

    # primary_key=True → this is the unique ID for each row
    # index=True → makes searching faster
    id = Column(Integer, primary_key=True, index=True)

    # unique=True → no two categories can have same name
    # nullable=False → name is required, cannot be empty
    name = Column(String, unique=True, nullable=False)

    # The price we normally sell this category for
    # nullable=True → optional, can be set later
    selling_price = Column(Float, nullable=True, default=0.0)

    # datetime.utcnow → automatically saves current time when created
    created_at = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────
# TABLE 2: PURCHASES
# ─────────────────────────────────────────
# Records every wholesale purchase from suppliers
# When your mother goes to Chickpet and buys 50 earrings for ₹800
# That gets recorded here
#
# Key insight: cost_per_piece = total_paid / quantity_bought
# This is calculated automatically, never entered manually

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)

    # ForeignKey → links to categories table
    # This means every purchase MUST belong to a category
    # Like saying "these 50 pieces are Earrings"
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)

    quantity_bought = Column(Integer, nullable=False)
    total_paid = Column(Float, nullable=False)

    # Auto-calculated: total_paid / quantity_bought
    # Stored so we don't recalculate every time we need it
    cost_per_piece = Column(Float)

    # Optional: which supplier did we buy from?
    supplier_name = Column(String, nullable=True)

    purchase_date = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────
# TABLE 3: SALES
# ─────────────────────────────────────────
# Records every sale to a customer
# This is where the UNIQUE feature lives: bargain tracking
#
# original_price = what we asked for
# actual_price   = what customer actually paid after bargaining
# bargain_loss   = original_price - actual_price (the invisible money)
#
# Example:
# Earring → asked ₹60, customer paid ₹50
# profit      = (₹50 - ₹16 cost) × 2 pieces = ₹68
# bargain_loss = (₹60 - ₹50) × 2 pieces = ₹20 lost to bargaining

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    quantity_sold = Column(Integer, nullable=False)

    # The price we WANTED to get per piece
    original_price = Column(Float, nullable=False)

    # The price we ACTUALLY got per piece (after bargaining)
    actual_price = Column(Float, nullable=False)

    # The cost per piece at time of sale (from stock table)
    # We store this here because avg_cost changes over time
    # We need to know what it WAS at the time of this sale
    cost_per_piece = Column(Float, nullable=False)

    # Auto-calculated: (actual_price - cost_per_piece) × quantity_sold
    profit = Column(Float, nullable=False)

    # Auto-calculated: (original_price - actual_price) × quantity_sold
    # This is the money lost to bargaining
    # NO OTHER APP IN INDIA TRACKS THIS
    bargain_loss = Column(Float, nullable=False)

    sale_datetime = Column(DateTime, default=datetime.utcnow)


# ─────────────────────────────────────────
# TABLE 4: STOCK
# ─────────────────────────────────────────
# Tracks current inventory levels per category
# This table is NEVER updated manually
# It updates automatically when:
# → BUY happens: quantity increases
# → SELL happens: quantity decreases
#
# avg_cost = weighted average of all purchases
# Example: bought 50 at ₹16, then 30 at ₹20
# avg_cost = (50×16 + 30×20) / (50+30) = ₹17.5

class Stock(Base):
    __tablename__ = "stock"

    id = Column(Integer, primary_key=True, index=True)

    # unique=True → only ONE stock record per category
    # Makes sense: Earrings has one stock count, not many
    category_id = Column(Integer, ForeignKey("categories.id"), unique=True, nullable=False)

    # Current pieces available right now
    quantity = Column(Integer, default=0)

    # Weighted average cost across all purchases
    avg_cost = Column(Float, default=0.0)

    last_updated = Column(DateTime, default=datetime.utcnow)
