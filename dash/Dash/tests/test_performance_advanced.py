"""
Tests for Return Decomposition and MWR/IRR modules.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pandas as pd
import numpy as np
import unittest

from core.performance.mwr import calculate_mwr, calculate_mwr_from_nav_flows, MWRResult
from core.performance.decomposition import decompose_bucket_return, DecomposedReturn
from core.consolidator import CurrencyBucket
from core.performance.flow_ledger import FlowLedger, CashFlow, FlowType


class TestMWR(unittest.TestCase):
    """Test MWR/IRR calculations."""

    def test_simple_investment(self):
        """Invest 10k, get 11.5k after 6 months → IRR = 15% period."""
        cfs = [(pd.Timestamp('2025-06-01'), -10000)]
        r = calculate_mwr(cfs, nav_final=11500, date_final=pd.Timestamp('2026-01-01'))
        self.assertTrue(r.converged)
        self.assertAlmostEqual(r.irr_period, 0.15, places=4)

    def test_multiple_investments(self):
        """Two investments: verify NPV ≈ 0 at IRR."""
        cfs = [
            (pd.Timestamp('2025-01-01'), -10000),
            (pd.Timestamp('2025-07-01'), -5000),
        ]
        r = calculate_mwr(cfs, nav_final=17000, date_final=pd.Timestamp('2026-01-01'))
        self.assertTrue(r.converged)
        self.assertAlmostEqual(r.npv_at_irr, 0.0, places=2)

    def test_no_return(self):
        """No gain: invest 10k, get 10k → IRR ≈ 0."""
        cfs = [(pd.Timestamp('2025-01-01'), -10000)]
        r = calculate_mwr(cfs, nav_final=10000, date_final=pd.Timestamp('2026-01-01'))
        self.assertTrue(r.converged)
        self.assertAlmostEqual(r.irr_annual, 0.0, places=3)

    def test_loss(self):
        """Loss: invest 10k, get 8k → negative IRR."""
        cfs = [(pd.Timestamp('2025-01-01'), -10000)]
        r = calculate_mwr(cfs, nav_final=8000, date_final=pd.Timestamp('2026-01-01'))
        self.assertTrue(r.converged)
        self.assertLess(r.irr_annual, 0)

    def test_empty_flows(self):
        """No flows → should handle gracefully."""
        r = calculate_mwr([], nav_final=0, date_final=pd.Timestamp('2026-01-01'))
        self.assertFalse(r.converged)

    def test_nav_series_interface(self):
        """Test calculate_mwr_from_nav_flows convenience function."""
        dates = pd.date_range('2025-01-01', periods=252, freq='B')
        # NAV grows 10% total from 10000 to 11000
        nav = pd.Series(np.linspace(10000, 11000, 252), index=dates)
        # No external flows — initial NAV of 10000 is treated as starting position
        flows = pd.Series(0.0, index=dates)

        r = calculate_mwr_from_nav_flows(nav, flows)
        self.assertTrue(r.converged)
        # Should be close to 10% for the period
        self.assertAlmostEqual(r.irr_period, 0.10, delta=0.02)


class TestDecomposition(unittest.TestCase):
    """Test return decomposition."""

    def _make_bucket(self, currency, nav_values, flow_values=None, income_values=None):
        dates = pd.date_range('2025-01-01', periods=len(nav_values), freq='B')
        nav = pd.Series(nav_values, index=dates)
        flows = pd.Series(flow_values or [0]*len(nav_values), index=dates)
        income = pd.Series(income_values or [0]*len(nav_values), index=dates)
        force_zero = pd.Series(False, index=dates)
        timing = pd.Series(0, index=dates)

        return CurrencyBucket(
            currency=currency,
            nav_series=nav,
            flow_series=flows,
            income_series=income,
            force_zero_series=force_zero,
            flow_timing_series=timing,
            tickers=['TEST']
        )

    def test_brl_asset_no_fx(self):
        """BRL asset: R_fx = 0, R_total = R_asset."""
        nav = [10000] + [10000 + i*10 for i in range(1, 100)]
        bucket = self._make_bucket('BRL', nav)
        fx = pd.Series(1.0, index=bucket.nav_series.index)

        result = decompose_bucket_return(bucket, fx)
        self.assertAlmostEqual(result.twr_fx, 0.0, places=6)
        self.assertAlmostEqual(result.twr_total, result.twr_asset, places=6)

    def test_usd_asset_with_fx(self):
        """USD asset + FX change: (1+R_a)×(1+R_fx)−1 = R_total."""
        # Asset worth 1000 USD, grows to 1100 USD (10%)
        nav = [1000] + [1000 + i for i in range(1, 100)] + [1100]
        dates = pd.date_range('2025-01-01', periods=len(nav), freq='B')

        bucket = CurrencyBucket(
            currency='USD',
            nav_series=pd.Series(nav, index=dates),
            flow_series=pd.Series(0, index=dates),
            income_series=pd.Series(0, index=dates),
            force_zero_series=pd.Series(False, index=dates),
            flow_timing_series=pd.Series(0, index=dates),
            tickers=['META']
        )

        # FX: USD/BRL goes from 5.0 to 5.5 (10% appreciation)
        fx = pd.Series(np.linspace(5.0, 5.5, len(nav)), index=dates)

        result = decompose_bucket_return(bucket, fx)

        # R_total should ≈ (1.10 × 1.10) − 1 = 0.21 (21%)
        expected_total = (1 + result.twr_asset) * (1 + result.twr_fx) - 1
        self.assertAlmostEqual(result.twr_total, expected_total, places=4)
        self.assertAlmostEqual(result.residual, 0.0, places=3)

    def test_residual_near_zero(self):
        """Residual should always be near zero for self-consistent decomposition."""
        nav = [10000] + [10000 + i*50 for i in range(1, 50)]
        bucket = self._make_bucket('USD', nav)
        dates = bucket.nav_series.index
        fx = pd.Series(np.linspace(5.0, 5.3, len(nav)), index=dates)

        result = decompose_bucket_return(bucket, fx)
        self.assertAlmostEqual(result.residual, 0.0, places=3)


class TestFlowLedger(unittest.TestCase):
    """Test FlowLedger operations."""

    def test_empty_ledger(self):
        ledger = FlowLedger()
        self.assertEqual(len(ledger), 0)
        df = ledger.to_dataframe()
        self.assertTrue(df.empty)

    def test_add_and_filter(self):
        ledger = FlowLedger()
        ledger.add(CashFlow(
            date=pd.Timestamp('2025-01-15'),
            amount=1000, currency='USD',
            flow_type=FlowType.COMPRA_ATIVO,
            ticker='META', fx_rate=5.0, amount_brl=5000
        ))
        ledger.add(CashFlow(
            date=pd.Timestamp('2025-03-01'),
            amount=50, currency='USD',
            flow_type=FlowType.DIVIDENDO,
            ticker='META', fx_rate=5.2, amount_brl=260
        ))

        self.assertEqual(len(ledger), 2)

        buys = ledger.filter_by_type(FlowType.COMPRA_ATIVO)
        self.assertEqual(len(buys), 1)

        meta = ledger.filter_by_ticker('META')
        self.assertEqual(len(meta), 2)

        usd = ledger.filter_by_currency('USD')
        self.assertEqual(len(usd), 2)

    def test_signed_cashflows(self):
        """Verify IRR sign convention."""
        ledger = FlowLedger()
        ledger.add(CashFlow(
            date=pd.Timestamp('2025-01-01'),
            amount=1000, currency='BRL',
            flow_type=FlowType.APORTE_BRL,
            amount_brl=1000
        ))
        ledger.add(CashFlow(
            date=pd.Timestamp('2025-06-01'),
            amount=100, currency='BRL',
            flow_type=FlowType.DIVIDENDO,
            amount_brl=100
        ))

        signed = ledger.signed_cashflows_brl
        self.assertEqual(len(signed), 2)
        self.assertLess(signed[0][1], 0)   # Aporte = negative
        self.assertGreater(signed[1][1], 0) # Dividend = positive


if __name__ == '__main__':
    unittest.main(verbosity=2)
