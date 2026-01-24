import sys
import os
import unittest
import pandas as pd
from datetime import datetime

# Add project root
sys.path.append(os.getcwd())

from core.utils import parse_decimal_br, parse_date_br

class TestLocale(unittest.TestCase):
    
    def test_parse_decimal_br_basic(self):
        """Test basic BR format parsing (1.000,00)"""
        self.assertAlmostEqual(parse_decimal_br("1.000,50"), 1000.50)
        self.assertAlmostEqual(parse_decimal_br("1,50"), 1.50)
        self.assertAlmostEqual(parse_decimal_br("100"), 100.0)

    def test_parse_decimal_br_currency(self):
        """Test currency stripping"""
        self.assertAlmostEqual(parse_decimal_br("R$ 1.000,00"), 1000.00)
        self.assertAlmostEqual(parse_decimal_br("US$ 50,20"), 50.20)
        self.assertAlmostEqual(parse_decimal_br("10,5%"), 10.5)
        
    def test_parse_decimal_br_spaces(self):
        """Test non-breaking spaces handling"""
        self.assertAlmostEqual(parse_decimal_br("1\xa0000,00"), 1000.00)
        self.assertAlmostEqual(parse_decimal_br("R$\xa010,00"), 10.00)

    def test_parse_decimal_br_types(self):
        """Test non-string inputs"""
        self.assertAlmostEqual(parse_decimal_br(100.50), 100.50)
        self.assertAlmostEqual(parse_decimal_br(100), 100.0)
        self.assertEqual(parse_decimal_br(None), 0.0)
        self.assertEqual(parse_decimal_br(""), 0.0)

    def test_parse_date_br(self):
        """Test date parsing DD/MM/YYYY"""
        s = pd.Series(["24/01/2026", "01/12/2023", "Invalid", None])
        parsed = parse_date_br(s)
        
        self.assertEqual(parsed[0], datetime(2026, 1, 24))
        self.assertEqual(parsed[1], datetime(2023, 12, 1))
        self.assertTrue(pd.isna(parsed[2]))
        self.assertTrue(pd.isna(parsed[3]))

    def test_parse_date_br_clean(self):
        """Test artifact cleaning"""
        s = pd.Series(["'24/01/2026", "24/01/2026 "])
        parsed = parse_date_br(s)
        self.assertEqual(parsed[0], datetime(2026, 1, 24))
        self.assertEqual(parsed[1], datetime(2026, 1, 24))

if __name__ == '__main__':
    unittest.main()
