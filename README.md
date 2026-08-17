# GLogos Desktop

Bible reader built with GTK4/libadwaita featuring version selection, book,
chapter and verse navigation. Verse-based sections, auto-scroll to the
selected verse, custom version import (**+** button), references
and devotional notes.

This project is **independent** of the GLogos browser extension. They only
share the local versions folder (`XDG_DATA_HOME/glogos/versions`): Bibles
you import here also appear in the extension and vice versa.

## Structure

```
app/                app source (main.js, window.js, widgets/, …)
app/lib/            data layer (provider + normalization + books/notes)
app/widgets/        GTK4 widgets (reader, notes_panel, menu_button, …)
install.sh          user-local installation
build-deb.sh        .deb packaging (Debian/Ubuntu/Zorin)
glogos.spec         .rpm packaging (Fedora/openSUSE)
```

## Installation

```bash
./install.sh            # user-local only (~/.local/share/glogos)
sudo apt install ./dist/glogos-desktop_1.0.0_all.deb   # system-wide
```

## Direct run (development)

```bash
gjs -m app/main.js
gjs -m app/main.js --version reina-valera-1960 --book Genesis --chapter 1
```

## Features

| Action | Description |
|---|---|
| **Select version** | Choose from available Bible versions (web or imported local). |
| **Select book** | Lists all 66 books of the standard biblical canon. |
| **Select chapter** | Navigate to a chapter of the chosen book. |
| **Select verse** | Auto-scrolls to the verse within the chapter. |
| **Import version (+)** | Import a JSON file with your own Bible translation (see format below). |
| **Separator** | Saves the current reference (version + book + chapter) to the left sidebar. |
| **References bar** | Lists saved references. Click to return to that reading. Delete references with the ✕ button. |
| **Zoom +/-** | Adjusts text size (in the Separator bar). |
| **Navigation < >** | Previous / next chapter (flanking the biblical text). |
| **Devotional notes** | Write notes per verse, verse range, or entire chapter. Saved automatically. |
| **Color markers** | Mark verses with colors (red, pink, green, yellow). |
| **Web version** | Read any chapter from [bible-api.com](https://bible-api.com) without importing files. |

## JSON format for importing Bible versions

The **+** button in the top bar opens a dialog to import a `.json` file
with a Bible translation. The format is:

```json
{
  "version": "Reina Valera 1960",
  "Year": 1960,
  "books": [
    {
      "name": "Genesis",
      "capitulos": [
        {
          "numero": 1,
          "versos": [
            {
              "numero": 1,
              "contenido": "In the beginning God created the heavens and the earth."
            },
            {
              "numero": 2,
              "contenido": "And the earth was formless and void..."
            }
          ]
        },
        {
          "numero": 2,
          "versos": [
            {
              "numero": 1,
              "contenido": "Thus the heavens and the earth were finished..."
            }
          ]
        }
      ]
    }
  ]
}
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `version` | string | Version name (e.g. "Reina Valera 1960"). Used as identifier. |
| `books` | array | List of books. Each book has `name` (string) and `capitulos` (array). |
| `books[].name` | string | Book name. Must match the standard biblical canon for the app to recognize it. |
| `books[].capitulos` | array | List of chapters. Each has `numero` (int) and `versos` (array). |
| `books[].capitulos[].numero` | int | Chapter number (1, 2, 3…). |
| `books[].capitulos[].versos` | array | List of verses in the chapter. |
| `books[].capitulos[].versos[].numero` | int | Verse number (1, 2, 3…). |
| `books[].capitulos[].versos[].contenido` | string | Verse text. |

### Optional field

| Field | Type | Description |
|---|---|---|
| `Year` | int | Translation year (e.g. 1960). Informational only. |

### Devotional notes

Notes are saved automatically inside the local JSON under each chapter,
in a `notas` field:

```json
{
  "numero": 2,
  "versos": [...],
  "notas": [
    {
      "id": "uuid",
      "nota": "text in **Markdown**",
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-15T10:35:00.000Z",
      "versoInicio": 7,
      "versoFin": 7
    }
  ]
}
```

- `versoInicio` / `versoFin`: present for verse or range notes.
- If absent, it is a chapter-level note.
- These fields are generated automatically when writing notes in the app.

### Supported book names

The app recognizes all 66 books of the standard Protestant biblical canon.
Some valid names:

```
Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges,
Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles,
Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes,
Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel,
Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum,
Habakkuk, Zephaniah, Haggai, Zechariah, Malachi,
Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians,
2 Corinthians, Galatians, Ephesians, Philippians, Colossians,
1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy,
Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter,
1 John, 2 John, 3 John, Jude, Revelation
```

### Minimal example

```json
{
  "version": "My Bible",
  "books": [
    {
      "name": "John",
      "capitulos": [
        {
          "numero": 3,
          "versos": [
            { "numero": 16, "contenido": "For God so loved the world..." }
          ]
        }
      ]
    }
  ]
}
```

## Versioning

GLogos Desktop uses [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: breaking changes (JSON format, completely redesigned interface).
- **MINOR**: new features backward-compatible with previous versions.
- **PATCH**: bug fixes with no functional changes.

`.deb` packages are built with the full version string.

## License

MIT.
