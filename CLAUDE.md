@AGENTS.md

The game now uses base64 PNG sprites instead of procedural graphics for planes, ships, carrier, and island. Explosions, bullets, power-ups, ocean background, and HUD remain procedural.


# Game: 1982

This is a vertical scrolling shooter themed around the Malvinas/Falklands War of 1982.

## Key decisions
- Single player only (player_mode: single_player)
- All graphics are procedural (Phaser Graphics API) — no base64 images
- Three scenes: TitleScene, GameScene, GameOverScene
- Controls: P1 joystick to move, P1_1 to shoot, P1_2 for bomb, START1 to start/pause
- High score persisted with key 'malvinas-highscore'

## Rules for editing
- Only edit game.js unless explicitly told otherwise
- Don't rewrite the whole file for small changes — edit the specific functions needed
- Check minified size stays under 50KB after changes
- Read AGENTS.md, docs/phaser-quick-start.md and docs/phaser-api.md before writing code