# FigCraft parity inventory

Build the command and capability baseline against the pinned FigCraft checkout:

```sh
bun run figcraft:parity
```

By default, the tool reads `/home/azaz/reference-outside-workspace/figcraft`,
which must be checked out at `92b83521afc0fc4abbcfb0c7adb169d5674647b5`.
Use an alternate checkout with `--figcraft-root <path>`; it must still be at
that exact revision.

The tool validates `docs/figcraft-parity/capability-evidence.json` and writes
the deterministic `docs/figcraft-parity/command-inventory.json`. Run
`bun run figcraft:parity --check` to verify the checked-in inventory without
writing it. A mismatch or invalid reference/evidence exits non-zero.

Command matching uses exact IDs. Duplicate Zenuxs registry IDs are counted in
`duplicateZenuxs` but counted once for parity; FigCraft source IDs and
capability evidence feature names must be unique. Collaboration commands are
explicitly listed under `collaborationExcluded`. Unmatched Zenuxs rows identify
`Session.all_commands()` as their source because that is the command catalog
interface's provenance.

Capability evidence records use `referencePaths`, `zenuxsSurfaces` (`packages`,
`app`, and `ui` arrays), `testEvidence`, `status`, and `note`. A `verified`
capability must cite at least one reference path, Zenuxs surface, or test.
