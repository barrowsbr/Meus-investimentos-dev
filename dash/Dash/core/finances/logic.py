
import pandas as pd
from datetime import datetime, date, timedelta
from dataclasses import dataclass
from typing import List, Dict, Optional

DATE_FORMAT = "%Y-%m-%d"

# Configuration (Could be moved to a config file/DB later)
CLOSING_DAY = 20  # Day the bill closes
DUE_DAY = 5       # Day the bill is due (next month)

@dataclass
class CreditCardBill:
    """Represents a monthly credit card bill."""
    month: int
    year: int
    due_date: date
    closing_date: date
    total_amount: float
    status: str  # 'Open', 'Closed', 'Future'
    items: List[dict]

class CreditCardEngine:
    """
    Engine to transform raw transactions into actionable Credit Card metrics.
    Handles 'Best Day to Buy' logic and Accrual vs Cash Flow views.
    """
    
    @staticmethod
    def calculate_bill_reference(transaction_date: date, closing_day: int = CLOSING_DAY) -> tuple:
        """
        Determines which Bill (Month/Year) a transaction belongs to.
        Rule: If Day > Closing Day, it goes to Next Month.
        """
        if transaction_date.day > closing_day:
            # Jumps to next month
            next_month = transaction_date.replace(day=1) + timedelta(days=32)
            return next_month.month, next_month.year
        else:
            return transaction_date.month, transaction_date.year

    @staticmethod
    def get_due_date(bill_month: int, bill_year: int, due_day: int = DUE_DAY) -> date:
        """Calculates the due date for a specific bill reference."""
        # Due date is usually in the reference month
        try:
            return date(bill_year, bill_month, due_day)
        except ValueError:
            # Handle Feb 30 etc if due_day is 30. Simplified for now.
            # Production grade would need proper end-of-month handling.
            return date(bill_year, bill_month, 28) 

    @staticmethod
    def process_transactions(df_transactions: pd.DataFrame) -> List[CreditCardBill]:
        """
        Groups transactions into Bills.
        df_transactions expects: ['date', 'amount', 'description', 'category', 'installments']
        """
        if df_transactions.empty:
            return []

        # Ensure datetime
        df = df_transactions.copy()
        if not pd.api.types.is_datetime64_any_dtype(df['date']):
            df['date'] = pd.to_datetime(df['date']).dt.date

        bills_map = {} # (month, year) -> list of items

        # 1. Expand Installments
        for _, row in df.iterrows():
            txn_date = row['date']
            amount = row['amount']
            installments = int(row.get('installments', 1))
            description = row['description']
            category = row['category']
            
            # Value per installment
            val_per_inst = amount / max(1, installments)
            
            for i in range(installments):
                # Calculate effective date for this installment
                # Logic: First installment follows standard rule. 
                # Subsequent ones add 1 month to the bill reference.
                
                # Base Bill Reference
                base_m, base_y = CreditCardEngine.calculate_bill_reference(txn_date)
                
                # Add 'i' months
                # Logic to add months:
                curr_y = base_y + ((base_m + i - 1) // 12)
                curr_m = (base_m + i - 1) % 12 + 1
                
                key = (curr_m, curr_y)
                
                if key not in bills_map:
                    bills_map[key] = {
                        'total': 0.0,
                        'items': [],
                        'due_date': CreditCardEngine.get_due_date(curr_m, curr_y)
                    }
                
                bills_map[key]['total'] += val_per_inst
                bills_map[key]['items'].append({
                    'date': txn_date,
                    'description': f"{description} ({i+1}/{installments})" if installments > 1 else description,
                    'category': category,
                    'value': val_per_inst,
                    'original_total': amount
                })

        # 2. Convert to Objects and Sort
        bills_list = []
        today = date.today()
        
        for (m, y), data in bills_map.items():
            # Determine Status
            # If Due Date < Today: Closed?
            # Actually user wants: Open, Closed, Future.
            # Simple assumption:
            # If Due Date < Today: Past/Closed (assuming paid, but user wants to know liquidity)
            # If Due Date > Today AND current date is before Closing: Open
            
            # Refined Logic:
            # Current Open Bill is the one where Today <= Closing Date of Previous Month? No.
            # Let's align with "Next Due Date".
            
            d_due = data['due_date']
            
            if d_due < today:
                status = "Closed"
            elif d_due.month == today.month and d_due.year == today.year:
                 # If today > due_day (5), it's late? Or next?
                 # Assume bill due day 5. If today is 12, the bill 5 is closed. The bill due next month 5 is Open.
                 if today.day > DUE_DAY:
                     status = "Closed" # Actually Late if unpaid, but functionally 'Past'
                 else:
                     status = "Open/DueSoon"
            else:
                # Future months
                # The 'Open' bill is the immediate next one.
                # Logic: Find the smallest delta (positive) from today.
                status = "Future"

            bills_list.append(CreditCardBill(
                month=m,
                year=y,
                due_date=d_due,
                closing_date=d_due - timedelta(days=15), # Approx
                total_amount=data['total'],
                status=status,
                items=data['items']
            ))
            
        # Sort by Due Date
        bills_list.sort(key=lambda x: x.due_date)
        
        # Post-process Status:
        # Find first bill where due_date >= today
        # Mark it as "Open". 
        # Mark previous as "Closed".
        # Mark subsequent as "Future".
        
        found_open = False
        for i, b in enumerate(bills_list):
            if b.due_date >= today:
                if not found_open:
                    b.status = "Open"
                    found_open = True
                else:
                    b.status = "Future"
            else:
                b.status = "Closed"
                
        return bills_list

class MetricCalculator:
    @staticmethod
    def calculate_burn_rate(bill: CreditCardBill) -> float:
        """Avg daily spend in current cycle"""
        # Closing Date
        # Start of Cycle = Previous Closing + 1 day
        # Actually simplified: Total Bill / Days passed in cycle (max 30)
        
        # Mock cycle start: 30 days before due date
        d_start = bill.due_date - timedelta(days=45) # Approx closing prev month
        d_end = bill.due_date - timedelta(days=15) # Approx closing current
        
        today = date.today()
        if today > d_end:
            days_passed = 30
        elif today < d_start:
            days_passed = 1
        else:
            days_passed = (today - d_start).days
            
        if days_passed <= 0: days_passed = 1
        
        return bill.total_amount / days_passed

    @staticmethod
    def calculate_points(amount_brl: float, dollar_ptax: float = 5.60, factor: float = 2.5) -> int:
        """Estimates points based on BRL amount."""
        return int((amount_brl / dollar_ptax) * factor)

