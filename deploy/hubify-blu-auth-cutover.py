#!/usr/bin/env python3
"""Explicit e6cc5eb Hubify pilot -> source-signature review continuation."""
import importlib.util
import sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'installer'))
import core
from payment_test_cutover import AuthNative
spec=importlib.util.spec_from_file_location('blu_test_cli',root/'deploy/hubify-payment-test-cutover.py')
cli=importlib.util.module_from_spec(spec);spec.loader.exec_module(cli)
if __name__=='__main__':
    try:cli.main(AuthNative)
    except Exception as error:
        print(str(error) if isinstance(error,core.StoreError) else 'Signature cutover stopped; inspect root-only journal.',file=sys.stderr);sys.exit(1)
