# DBZ Fuzion Calibrated GM Tools

GM-only calibration, canon lookup, and legacy NPC tooling for `dbz-fuzion-calibrated`.

All exported actions check `game.user.isGM`; non-GM users receive a warning and no report, XP/BP mutation, or NPC seeding action.

Current GM APIs are exposed under `game.dbzfGmTools`:

- `openPowerCalibrationTool(actor)`
- `applySuggestedBattlePower(actor)`
- `npcSeederDryRun()`
- `seedLegacyNpcCompendium({ dryRun })`
- `loadCanonPowerRows()`
- `findCanonRows(name)`

The legacy NPC pack is intended for GM use and ships with player ownership disabled.

## License

Licensed under the [Apache License 2.0](LICENSE). You may use, modify and redistribute
this, including commercially and in closed-source spin-offs, provided you keep the copyright
notice and the [NOTICE](NOTICE) file, and state what you changed. The licence grants no rights
to the author's name or branding.

The two data files described below are the exception: they are CC BY-SA 3.0, not Apache.
See [NOTICE](NOTICE).

## Data sources and attribution

`data/canon/canon_power_levels_curated.json` is curated from the Dragon Ball Wiki page
[List of Power Levels](https://dragonball.fandom.com/wiki/List_of_Power_Levels). That text is
published by Fandom under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), and the
values here are reused under the same licence. The page draws on manga, anime, films, pamphlets,
Daizenshuu guides and video games, so the rows are optional GM calibration data rather than a
single authoritative scale.

`data/npc/dbzf_npc_compendium_source.json` was extracted from the AcroForm fields of 110 legacy
DBZ RPG NPC sheet PDFs. The character biography text carried in those sheets appears to originate
from the Dragon Ball Wiki, so it is likewise treated as CC BY-SA 3.0 and attributed to Fandom and
its contributors. Statistics, techniques and the DBZ Fuzion rules mappings are the work of this
project and the original DBZ RPG authors.

Dragon Ball is the property of Bird Studio / Shueisha / Toei Animation. This is an unofficial fan
project, not affiliated with or endorsed by the rights holders, and is distributed free of charge.
