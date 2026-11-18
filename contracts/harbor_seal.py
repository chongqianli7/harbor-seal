# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import hashlib
import json
import re
import typing

from genlayer import *


class HarborSeal(gl.Contract):
    registry_id: str
    sites: TreeMap[str, str]
    journal: TreeMap[str, str]

    def __init__(self, registry_id: str):
        if not re.fullmatch(r"[0-9a-f]{32}", registry_id):
            raise gl.UserError("INVALID_REGISTRY_ID")
        self.registry_id = registry_id

    def _key(self, site: str) -> str:
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?/[a-z0-9][a-z0-9-]{0,62}", site):
            raise gl.UserError("INVALID_SITE")
        return site

    def _load(self, site: str) -> dict:
        return json.loads(self.sites[self._key(site)]) if site in self.sites else self._empty(site)

    def _empty(self, site: str) -> dict:
        self._key(site)
        return {"owner": "", "nominee": "", "revision": 0, "events": 0}

    def _save(self, site: str, state: dict, action: str, source: str = "", digest: str = "") -> None:
        state["events"] += 1
        self.sites[site] = json.dumps(state)
        event = dict(state)
        event.update(action=action, actor=str(gl.message.sender_address).lower(), source=source, digest=digest)
        self.journal[site + ":" + str(state["events"])] = json.dumps(event)

    def _prove(self, site: str, revision: int, actor: str) -> tuple:
        host, project = site.split("/")
        source = f"https://{host}.github.io/{project}/harbor-proof-{revision}.txt"
        expected = f"harbor-seal:v1:{self.registry_id}:{site}:{revision}:{actor}"

        def observe() -> str:
            try:
                response = gl.nondet.web.get(source)
                if response.status != 200:
                    return "HTTP_" + str(response.status)
                body = bytes(response.body)
                if len(body) > 512 or body.rstrip(b"\r\n") != expected.encode("ascii"):
                    return "PROOF_MISMATCH"
                return hashlib.sha256(expected.encode("ascii")).hexdigest()
            except Exception:
                return "SOURCE_UNAVAILABLE"

        result = gl.eq_principle.strict_eq(observe)
        if len(result) != 64:
            raise gl.UserError(result)
        return source, result

    @gl.public.view
    def context(self) -> str:
        return self.registry_id

    @gl.public.view
    def record(self, site: str) -> str:
        return json.dumps(self._load(site))

    @gl.public.view
    def history(self, site: str, before: u32) -> str:
        state = self._load(site)
        end = min(int(before) - 1, state["events"]) if before else state["events"]
        return json.dumps([json.loads(self.journal[site + ":" + str(i)])
                           for i in range(end, max(end - 12, 0), -1)])

    @gl.public.write
    def claim(self, site: str, revision: u32) -> None:
        state = self._load(site)
        if state["owner"]:
            raise gl.UserError("ALREADY_REGISTERED")
        self._activate(site, state, int(revision), "CLAIMED")

    @gl.public.write
    def nominate(self, site: str, nominee: Address) -> None:
        state = self._load(site)
        actor = str(gl.message.sender_address).lower()
        target = str(nominee).lower()
        if actor != state["owner"]:
            raise gl.UserError("OWNER_REQUIRED")
        if state["nominee"] or target == actor or target == "0x" + "0" * 40:
            raise gl.UserError("INVALID_NOMINATION")
        state["nominee"] = target
        self._save(site, state, "NOMINATED")

    @gl.public.write
    def cancel(self, site: str) -> None:
        state = self._load(site)
        if str(gl.message.sender_address).lower() != state["owner"]:
            raise gl.UserError("OWNER_REQUIRED")
        if not state["nominee"]:
            raise gl.UserError("NO_NOMINATION")
        state["nominee"] = ""
        state["revision"] += 1
        self._save(site, state, "CANCELED")

    @gl.public.write
    def accept(self, site: str, revision: u32) -> None:
        state = self._load(site)
        if str(gl.message.sender_address).lower() != state["nominee"]:
            raise gl.UserError("NOMINEE_REQUIRED")
        self._activate(site, state, int(revision), "TRANSFERRED")

    @gl.public.write
    def release(self, site: str) -> None:
        state = self._load(site)
        if str(gl.message.sender_address).lower() != state["owner"]:
            raise gl.UserError("OWNER_REQUIRED")
        state.update(owner="", nominee="", revision=state["revision"] + 1)
        self._save(site, state, "RELEASED")

    def _activate(self, site: str, state: dict, revision: int, action: str) -> None:
        if revision != state["revision"] + 1:
            raise gl.UserError("STALE_REVISION")
        actor = str(gl.message.sender_address).lower()
        source, digest = self._prove(site, revision, actor)
        state.update(owner=actor, nominee="", revision=revision)
        self._save(site, state, action, source, digest)
