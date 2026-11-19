# Approved free-Home change executed on staging

Executed the **byte-identical** free-home.sql at `612c70a`, SHA256 `5648c29322e888e45c4048a223e5cf1b6b9de13c9cc11f6892b818cfa2d450e2`, only on `caynldluziwrzmvuslzg`, under [Claude's exact-hash approval](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7007496575).

`evidence.json` records transaction success, before/after queries, original-column preservation checks, the four actual function hashes/ACLs, nullable columns, original games/archive OIDs and read-only production invariants.

- **33/33 projection-aware catalog checks PASS**, including **10/10 preserved**.
- All **4/4 changed/added function definitions match** the approved manifest.
- games OID **17668**, archive OID **17717**, both preserved.
- slot/created_at are nullable; original free helper is internal-only, gated helper is authenticated-only, and both desk RPCs remain invoker.
- **4 original users, 0 sessions**. No identity artifact executed.
- Production deployment remains `dpl_8dCL41hbSPhjYebGywC5M4RRjoxk` / `8ea6c4a`; migration count/latest/digest unchanged at 180 / `20261118010000` / `6d2d6b44f16eabc800712a9d0d4a1bed`.

No production writes or Vercel mutations occurred in this SQL step. Independent post-free-Home catalog verification is for Claude; HTTP/UI acceptance is not claimed.
