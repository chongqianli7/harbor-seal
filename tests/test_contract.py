"""Unit tests with an isolated GenVM host adapter."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path

WALLETS = ["0x" + digit * 40 for digit in "123"]
SITE = "test-account/project"
REGISTRY = "0" * 32


class TreeMap(dict):
    pass


class UserError(Exception):
    pass


def observe_twice(fn):
    first, second = fn(), fn()
    if first != second:
        raise UserError("NO_CONSENSUS")
    return first


module = types.ModuleType("genlayer")
module.TreeMap = TreeMap
module.u32 = int
module.Address = str
module.gl = types.SimpleNamespace(
    Contract=object, vm=types.SimpleNamespace(UserError=UserError),
    message_raw={"datetime":"2026-11-25T10:00:00+00:00"},
    public=types.SimpleNamespace(view=lambda fn: fn, write=lambda fn: fn),
    message=types.SimpleNamespace(sender_address=WALLETS[0]),
    eq_principle=types.SimpleNamespace(strict_eq=observe_twice),
    nondet=types.SimpleNamespace(web=types.SimpleNamespace()),
)
sys.modules["genlayer"] = module
spec = importlib.util.spec_from_file_location(
    "harbor_seal", Path(__file__).parents[1] / "contracts" / "harbor_seal.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class HarborSealTest(unittest.TestCase):
    def setUp(self):
        module.gl.message_raw["datetime"] = "2026-11-25T10:00:00+00:00"
        self.registry = contract.HarborSeal(REGISTRY)
        self.registry.sites = TreeMap()
        self.registry.journal = TreeMap()
        module.gl.message.sender_address = WALLETS[0]

    def publish(self, revision, wallet):
        proof = f"harbor-seal:v2:{REGISTRY}:{SITE}:{revision}:{wallet}".encode()
        module.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=200, body=proof)

    def test_handover_and_replay(self):
        self.publish(1, WALLETS[0])
        self.registry.claim(SITE, 1)
        with self.assertRaisesRegex(UserError, "ALREADY_REGISTERED"):
            self.registry.claim(SITE, 1)
        self.registry.nominate(SITE, WALLETS[1])
        module.gl.message.sender_address = WALLETS[2]
        with self.assertRaisesRegex(UserError, "NOMINEE_REQUIRED"):
            self.registry.accept(SITE, 2)
        module.gl.message.sender_address = WALLETS[1]
        with self.assertRaisesRegex(UserError, "PROOF_MISMATCH"):
            self.registry.accept(SITE, 2)
        self.publish(2, WALLETS[1])
        self.registry.accept(SITE, 2)
        self.assertEqual(len(self.registry.journal), 3)

    def test_cancellation_and_release_advance_revision(self):
        self.publish(1, WALLETS[0])
        self.registry.claim(SITE, 1)
        self.registry.nominate(SITE, WALLETS[1])
        self.registry.cancel(SITE)
        self.registry.release(SITE)
        with self.assertRaisesRegex(UserError, "STALE_REVISION"):
            self.registry.claim(SITE, 3)

    def test_faults_preserve_empty_record(self):
        before = self.registry.record(SITE)
        responses = iter([404, 503])
        module.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=next(responses))
        with self.assertRaisesRegex(UserError, "NO_CONSENSUS"):
            self.registry.claim(SITE, 1)
        module.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=503)
        with self.assertRaisesRegex(UserError, "HTTP_503"):
            self.registry.claim(SITE, 1)
        self.assertEqual(before, self.registry.record(SITE))
        self.assertFalse(self.registry.journal)

    def test_invalid_origin_and_missing_file(self):
        with self.assertRaisesRegex(UserError, "INVALID_SITE"):
            self.registry.claim("other/repo/../path", 1)
        module.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=404)
        with self.assertRaisesRegex(UserError, "HTTP_404"):
            self.registry.claim(SITE, 1)

    def test_expiry_renewal_and_revision(self):
        self.publish(1, WALLETS[0])
        self.registry.claim(SITE, 1, 120)
        self.registry.nominate(SITE, WALLETS[1])
        module.gl.message_raw["datetime"] = "2026-11-25T10:02:00+00:00"
        module.gl.message.sender_address = WALLETS[1]
        with self.assertRaisesRegex(UserError, "SEAL_EXPIRED"):
            self.registry.accept(SITE, 2)
        module.gl.message.sender_address = WALLETS[0]
        with self.assertRaisesRegex(UserError, "STALE_REVISION"):
            self.registry.renew(SITE, 1)
        self.publish(2, WALLETS[0])
        self.registry.renew(SITE, 2)
        self.assertEqual(self.registry._load(SITE)["nominee"], "")
        self.registry.nominate(SITE, WALLETS[1])
        self.publish(3, WALLETS[1])
        module.gl.message.sender_address = WALLETS[1]
        self.registry.accept(SITE, 3)
        self.assertEqual(self.registry._load(SITE)["owner"], WALLETS[1])

    def test_unavailable_proof_does_not_extend_or_revoke(self):
        self.publish(1, WALLETS[0])
        self.registry.claim(SITE, 1, 120)
        prior = self.registry.record(SITE)
        module.gl.nondet.web.get = lambda _: types.SimpleNamespace(status=503)
        with self.assertRaisesRegex(UserError, "HTTP_503"):
            self.registry.renew(SITE, 2)
        self.assertEqual(self.registry.record(SITE), prior)
