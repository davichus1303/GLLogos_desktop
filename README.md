# GLogos Desktop

Lector de la Biblia GTK4/libadwaita con selección de versión, libro,
capítulo y versículo. Secciones por verso, scroll automático al verso
seleccionado, importación de versiones propias (botón **+**), referencias
y notas devocionales.

Este proyecto es **independiente** de la extensión GLogos. Solo comparten la
carpeta de versiones locales (`XDG_DATA_HOME/glogos/versions`): las biblias
que importes aquí también aparecen en la extensión y viceversa.

## Estructura

```
app/                fuente de la app (main.js, window.js, widgets/, …)
app/lib/            capa de datos (provider + normalización + libros/notas)
app/widgets/        widgets GTK4 (reader, notes_panel, menu_button, …)
install.sh          instalación solo para tu usuario
build-deb.sh        empaquetado .deb (Debian/Ubuntu/Zorin)
glogos.spec         empaquetado .rpm (Fedora/openSUSE)
```

## Instalación

```bash
./install.sh            # solo tu usuario (~/.local/share/glogos)
sudo apt install ./dist/glogos-desktop_1.0.0_all.deb   # todo el sistema
```

## Ejecución directa (desarrollo)

```bash
gjs -m app/main.js
gjs -m app/main.js --version reina-valera-1960 --book Génesis --chapter 1
```

## Funcionalidades

| Acción | Descripción |
|---|---|
| **Seleccionar versión** | Elige entre las versiones bíblicas disponibles (web o locales importadas). |
| **Seleccionar libro** | Lista los 66 libros del canon bíblico. |
| **Seleccionar capítulo** | Navega al capítulo del libro elegido. |
| **Seleccionar verso** | Hace scroll automático al verso dentro del capítulo. |
| **Importar versión (+)** | Importa un archivo JSON con tu propia traducción bíblica (ver formato abajo). |
| **Separador** | Guarda la referencia actual (versión + libro + capítulo) en la barra lateral izquierda. |
| **Barra de referencias** | Lista las referencias guardadas. Haz clic para volver a esa lectura. Elimina referencias con el botón ✕. |
| **Zoom +/-** | Ajusta el tamaño del texto (en la barra del Separador). |
| **Navegación < >** | Capítulo anterior / siguiente (a los lados del texto bíblico). |
| **Notas devocionales** | Escribe notas por verso, rango de versos o capítulo completo. Se guardan automáticamente. |
| **Marcadores de color** | Marca versos con colores (rojo, rosa, verde, amarillo). |
| **Versión web** | Lee cualquier capítulo desde [bible-api.com](https://bible-api.com) sin importar archivos. |

## Formato JSON para importar versiones bíblicas

El botón **+** en la barra superior abre un diálogo para importar un archivo
`.json` con una traducción bíblica. El formato es:

```json
{
  "version": "Reina Valera 1960",
  "Year": 1960,
  "books": [
    {
      "name": "Génesis",
      "capitulos": [
        {
          "numero": 1,
          "versos": [
            {
              "numero": 1,
              "contenido": "En principio creó Dios los cielos y la tierra."
            },
            {
              "numero": 2,
              "contenido": "Y la tierra estaba sin forma y vacía..."
            }
          ]
        },
        {
          "numero": 2,
          "versos": [
            {
              "numero": 1,
              "contenido": "Fueron, pues, acabados los cielos..."
            }
          ]
        }
      ]
    }
  ]
}
```

### Campos obligatorios

| Campo | Tipo | Descripción |
|---|---|---|
| `version` | string | Nombre de la versión (ej. "Reina Valera 1960"). Se usa como identificador. |
| `books` | array | Lista de libros. Cada libro tiene `name` (string) y `capitulos` (array). |
| `books[].name` | string | Nombre del libro. Debe coincidir con el canon bíblico estándar para que la app lo reconozca. |
| `books[].capitulos` | array | Lista de capítulos. Cada uno tiene `numero` (int) y `versos` (array). |
| `books[].capitulos[].numero` | int | Número del capítulo (1, 2, 3…). |
| `books[].capitulos[].versos` | array | Lista de versos del capítulo. |
| `books[].capitulos[].versos[].numero` | int | Número del verso (1, 2, 3…). |
| `books[].capitulos[].versos[].contenido` | string | Texto del verso. |

### Campo opcional

| Campo | Tipo | Descripción |
|---|---|---|
| `Year` | int | Año de la traducción (ej. 1960). Informativo. |

### Notas devocionales

Las notas se guardan automáticamente dentro del JSON local bajo cada capítulo,
en un campo `notas`:

```json
{
  "numero": 2,
  "versos": [...],
  "notas": [
    {
      "id": "uuid",
      "nota": "texto en **Markdown**",
      "createdAt": "2026-01-15T10:30:00.000Z",
      "updatedAt": "2026-01-15T10:35:00.000Z",
      "versoInicio": 7,
      "versoFin": 7
    }
  ]
}
```

- `versoInicio` / `versoFin`: presentes en notas de verso o rango.
- Si no tienen `versoInicio`/`versoFin`, es una nota de capítulo completo.
- Estos campos se generan automáticamente al escribir notas en la app.

### Nombres de libros soportados

La app reconoce los 66 libros del canon bíblico protestante estándar.
Algunos nombres válidos:

```
Génesis, Éxodo, Levítico, Números, Deuteronomio, Josué, Jueces,
Rut, 1 Samuel, 2 Samuel, 1 Reyes, 2 Reyes, 1 Crónicas, 2 Crónicas,
Esdras, Nehemías, Ester, Job, Salmos, Proverbios, Eclesiastés,
Cantar de los Cantarios, Isaías, Jeremías, Lamentaciones, Ezequiel,
Daniel, Oseas, Joel, Amós, Abdías, Jonás, Miqueas, Nahúm,
Habacuc, Sofonías, Ageo, Zacarías, Malaquías,
Mateo, Marcos, Lucas, Juan, Hechos, Romanos, 1 Corintios,
2 Corintios, Gálatas, Efesios, Filipenses, Colosenses,
1 Tesalonicenses, 2 Tesalonicenses, 1 Timoteo, 2 Timoteo,
Tito, Filemón, Hebreos, Santiago, 1 Pedro, 2 Pedro,
1 Juan, 2 Juan, 3 Juan, Judas, Apocalipsis
```

### Ejemplo mínimo

```json
{
  "version": "Mi Biblia",
  "books": [
    {
      "name": "Juan",
      "capitulos": [
        {
          "numero": 3,
          "versos": [
            { "numero": 16, "contenido": "Porque de tal manera amó Dios al mundo..." }
          ]
        }
      ]
    }
  ]
}
```

## Versionado

GLogos Desktop usa [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR**: cambios que rompen compatibilidad (formato JSON, interfaz completamente rediseñada).
- **MINOR**: nuevas funcionalidades compatibles con versiones anteriores.
- **PATCH**: corrección de bugs sin cambios funcionales.

Los paquetes `.deb` se generan con la versión completa.

## Licencia

MIT.
