# Emotion Taxonomy: Mood Meter

Source model: Yale RULER framework (Marc Brackett). Two-dimensional: **pleasantness** (x-axis)
× **energy** (y-axis), divided into four quadrants.

## Quadrants (EMOTION_FAMILIES)

| Key | Axis position | Name |
|-----|--------------|------|
| `yellow` | High energy, high pleasantness | Yellow |
| `red` | High energy, low pleasantness | Red |
| `green` | Low energy, high pleasantness | Green |
| `blue` | Low energy, low pleasantness | Blue |

## FAMILY_COLORS

| Family | Hex |
|--------|-----|
| `yellow` | `#F7C948` |
| `red` | `#E05252` |
| `green` | `#52B788` |
| `blue` | `#5B8FD4` |

## EMOTIONS_BY_FAMILY

All labels are uppercase strings with no spaces.

### yellow

`ECSTATIC`, `ENERGIZED`, `EXCITED`, `THRILLED`, `JUBILANT`,
`EXUBERANT`, `LIVELY`, `CHEERFUL`, `HOPEFUL`, `PLAYFUL`,
`MOTIVATED`, `INSPIRED`, `HAPPY`, `JOYFUL`, `PLEASED`

### red

`ANGRY`, `FURIOUS`, `RESENTFUL`, `HOSTILE`, `FRUSTRATED`,
`ANNOYED`, `WORRIED`, `FEARFUL`, `ANXIOUS`, `TENSE`,
`STRESSED`, `SHOCKED`, `DISGUSTED`, `HORRIFIED`, `TROUBLED`

### green

`CALM`, `PEACEFUL`, `CONTENT`, `SERENE`, `RELAXED`,
`GRATEFUL`, `SECURE`, `SATISFIED`, `FULFILLED`, `COMPASSIONATE`,
`THOUGHTFUL`, `GENTLE`, `TRANQUIL`, `RESTFUL`, `COMFORTABLE`

### blue

`SAD`, `HOPELESS`, `LONELY`, `BORED`, `TIRED`,
`MISERABLE`, `DEPRESSED`, `DEJECTED`, `MELANCHOLY`, `GLOOMY`,
`DISAPPOINTED`, `SORROWFUL`, `WEARY`, `DISHEARTENED`, `WITHDRAWN`

## CONTEXT_TAGS

`Work`, `Family`, `Health`, `Social`, `Money`, `Relationship`, `Other`

## Intensity

Ordinal 1–5. Represents the degree of the emotion within its quadrant:
1 = very mild, 5 = very intense. Stored as a number; never derived from
quadrant position (position and intensity are orthogonal axes).

## Notes

- This list is a curated v1 set intended to cover common daily emotional
  states without overwhelming the wheel UI.
- Emotion labels are uppercase to distinguish them from UI display strings.
  UI layer is responsible for converting to title-case or locale strings.
- `EMOTION_FAMILIES` ordering (yellow, red, green, blue) reflects quadrant
  rendering order clockwise from top-right: Yellow (Q1), Red (Q2), Blue (Q3),
  Green (Q4). Wheel components should follow this order.
