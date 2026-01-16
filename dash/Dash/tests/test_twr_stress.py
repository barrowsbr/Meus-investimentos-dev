
import unittest
import pandas as pd
import numpy as np
import sys
import os

# Add parent dir to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.performance_engine import PerformanceEngine

class TestTWRReliability(unittest.TestCase):

    def setUp(self):
        # Base DataFrame setup
        self.dates = pd.to_datetime(['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04'])
        
    def test_basic_twr_no_flow(self):
        """Test 1: Simple Market Gain (10% each day)"""
        df = pd.DataFrame({
            'nav': [100.0, 110.0, 121.0, 133.1],
            'flow': [100.0, 0.0, 0.0, 0.0]
        }, index=self.dates)
        
        eng = PerformanceEngine(df)
        res = eng.calculate_twr()
        
        # Day 1: (110 - 100)/100 = 10%
        # Day 2: (121 - 110)/110 = 10%
        # Day 3: (133.1 - 121)/121 = 10%
        # Total: 1.1^3 - 1 = 33.1%
        
        self.assertAlmostEqual(res.total_twr, 33.10, places=2)
        print("\nTest 1 (Basic): OK")

    def test_perfect_deposit_handling(self):
        """Test 2: Large Deposit with Zero Market Move (Should be 0% TWR)"""
        # Day 1: Starts 100. Ends 1100 (1000 Deposit).
        df = pd.DataFrame({
            'nav': [100.0, 1100.0],
            'flow': [100.0, 1000.0]
        }, index=self.dates[:2])
        
        eng = PerformanceEngine(df)
        res = eng.calculate_twr()
        
        # Base = 100 (EoD default)
        # Gain = 1100 - 100 - 1000 = 0
        # Return = 0 / 100 = 0%
        self.assertAlmostEqual(res.total_twr, 0.0, places=2)
        print("Test 2 (Deposit): OK")

    def test_windowed_suppression_flag(self):
        """Test 3: The Fix - Force Return Zero flag"""
        # Scenario: Market Crashes 50%, but we flag it as 'Suppressed'
        df = pd.DataFrame({
            'nav': [100.0, 50.0],
            'flow': [100.0, 0.0],
            'force_return_zero': [False, True]
        }, index=self.dates[:2])
        
        eng = PerformanceEngine(df)
        res = eng.calculate_twr()
        
        # Without flag: (50 - 100)/100 = -50%
        # With flag: Should be 0.0%
        self.assertAlmostEqual(res.total_twr, 0.0, places=2)
        print("Test 3 (Suppression Flag): OK")

    def test_full_liquidation_and_reentry(self):
        """Test 4: Redemption to Zero and Re-entry"""
        # D1: 100 (Start)
        # D2: 0 (Redeem 100) -> Return 0?
        # D3: 0 (Stay 0)
        # D4: 100 (Deposit 100) -> Return 0?
        
        dates = pd.to_datetime(['2023-01-01', '2023-01-02', '2023-01-03', '2023-01-04'])
        df = pd.DataFrame({
            'nav': [100.0, 0.0, 0.0, 100.0],
            'flow': [100.0, -100.0, 0.0, 100.0] 
        }, index=dates)
        
        eng = PerformanceEngine(df)
        res = eng.calculate_twr()
        
        # D2: Start=100. Flow=-100. Gain = 0 + 0 - 100 - (-100) = 0. Base=100. Ret=0.
        # D3: Start=0. Flow=0. Base=0. Ret=0.
        # D4: Start=0. Flow=100. Gain = 100 - 0 - 100 = 0. Base=0. Ret=0.
        
        self.assertAlmostEqual(res.total_twr, 0.0, places=2)
        print("Test 4 (Liquidation/Reentry): OK")

    def test_outlier_gap_scenario_clean(self):
        """Test 5: The original 'Gap' Scenario with Windowed Fix Logic Simulated"""
        # User deposits 10,000 on top of 100.
        # Market drops 10% (from 100 base) = -10 loss.
        # BUT because of lag, NAV shows only 100 (money lost/transit).
        # We want suppression.
        
        df = pd.DataFrame({
            'nav': [100.0, 100.0], # NAV didnt move despite flow
            'flow': [100.0, 10000.0], # Huge flow
            'force_return_zero': [False, True] # App detects ratio > 15% and flags it
        }, index=self.dates[:2])
        
        eng = PerformanceEngine(df)
        res = eng.calculate_twr()
        
        self.assertAlmostEqual(res.total_twr, 0.0, places=2)
        print("Test 5 (Gap Scenario + Fix): OK")

if __name__ == '__main__':
    unittest.main()
