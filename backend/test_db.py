"""Compatibility entry point for the isolated database index test."""

import unittest


if __name__ == "__main__":
    from tests.test_database import DatabaseIndexTests

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DatabaseIndexTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
