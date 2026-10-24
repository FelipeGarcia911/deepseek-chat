# Bibliotecas internas

Esta etapa prepara los paquetes y comprueba sus importaciones. Las entradas
`src/index.ts` contienen `export {}`: aún no se han movido componentes, tipos,
utilidades ni validaciones. El panel de administración se creará después.

## Dependencias

```text
frontend -> @chat-app/ui
frontend -> @chat-app/shared
backend  -> @chat-app/shared
```

`packages/ui` es la futura biblioteca React del chat y del admin. Declara
React y React DOM como peerDependencies: las aplicaciones consumidoras deben
aportar versiones compatibles. Esto evita tratar React como una copia privada
de la biblioteca. Los tipos de React y TypeScript son herramientas de desarrollo.

`packages/shared` será código común para navegador y servidor. Su configuración
TypeScript no incluye DOM ni los tipos globales de Node: usar `window`, `document`
o `process` produce un error de tipos. Tampoco depende de React, Express ni
de ninguna aplicación. Esto orienta el paquete hacia funciones portables,
contratos de datos y validaciones. Las credenciales y la lógica exclusiva del
servidor deben quedarse en el backend.

## Cómo se enlazan

Los manifiestos consumidores declaran `"@chat-app/shared": "workspace:*"`
y el frontend también declara UI. pnpm enlaza las carpetas locales y exige
que el paquete exista dentro del workspace. No se publican ni se descargan
estos paquetes de un registro. Todos los paquetes son privados.

Las aplicaciones importan por nombre de paquete, no mediante rutas como
`../../packages/shared/src`. Cada paquete expone su API pública desde index.ts
y su manifiesto define la entrada mediante exports. Al añadir código en la
siguiente etapa, habrá que exportarlo desde esa entrada.

Las importaciones actuales son de efecto lateral:

```ts
// Frontend
import "@chat-app/ui";
import "@chat-app/shared";

// Backend
import "@chat-app/shared";
```

Comprueban resolución e integración sin inventar componentes o funciones de
negocio. Al estar vacías, no cambian el comportamiento de las aplicaciones.
UI se incorpora solo al frontend: el backend consume shared.

## Compilación y formatos

UI genera ESM y declaraciones de tipos en packages/ui/dist. Shared genera
ESM en dist/esm y CommonJS en dist/cjs desde el mismo código fuente:

- Vite y el frontend seleccionan la entrada `import` de shared.
- El backend actual compila a CommonJS y selecciona la entrada `require`.
- Cada entrada tiene sus declaraciones .d.ts.
- El campo types de shared permite que el backend conserve su resolución
  TypeScript actual; no es necesario cambiar su sistema de módulos.

El pequeño script compile.mjs de shared ejecuta TypeScript para ambos formatos
y escribe un package.json con type: commonjs en dist/cjs. Ese archivo hace
que Node interprete esos .js como CommonJS aunque el paquete sea ESM.
En modo watch mantiene ambos compiladores activos y los detiene al terminar.

En las bibliotecas, los imports relativos entre futuros archivos TypeScript
deben indicar la extensión .js de salida para que funcionen también como
ESM en Node. No se requieren aliases de Vite ni paths de TypeScript.

## Comandos desde la raíz

```sh
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm build` respeta el grafo: compila las bibliotecas antes de sus consumidores.
`pnpm typecheck` construye primero las bibliotecas porque los consumidores
necesitan encontrar sus declaraciones de tipos incluso en un checkout limpio.
El lint existente sigue comprobando el frontend.

`pnpm dev` hace un build inicial de los paquetes y luego ejecuta todos los
servidores y compiladores en paralelo. Los cambios en las bibliotecas se
recompilan; el backend vigila dist/cjs de shared y se reinicia cuando cambia.
Los archivos generados dist están ignorados por Git.

`pnpm dev:frontend` incluye el frontend y sus bibliotecas; `pnpm dev:backend`
incluye el backend y shared. Las dependencias se seleccionan con el sufijo
`...` del filtro de pnpm. Ctrl+C detiene el conjunto.

Para el futuro admin, basta añadir su carpeta al workspace y declarar las
dependencias workspace:* correspondientes. Esta etapa no crea esa aplicación.

Referencias: [filtros de pnpm](https://pnpm.io/filtering) y
[módulos TypeScript](https://www.typescriptlang.org/docs/handbook/modules/reference.html).

## Validación de esta etapa

Con Node 26.12.1 y pnpm 12.14.0 se comprobaron:

- Instalación con lockfile congelado; se conservaron las versiones de paquetes
  del registro. El lockfile incorpora enlaces locales y resuelve el peer de
  tipos de Node de Vite en el nuevo grafo.
- Build de los cuatro paquetes y comprobación de tipos.
- Lint existente del frontend.
- Importación ESM de UI/shared desde frontend y require de shared desde backend.
- Arranque de desarrollo sin dist previo en las bibliotecas.
- Resolución de ambas bibliotecas por Vite al transformar App.tsx.
- Recompilación de UI y de los dos formatos de shared al modificar contenido,
  junto con el reinicio del backend y su respuesta HTTP.
- Respuesta HTTP del backend compilado con shared enlazado.

Los cambios temporales de las pruebas se restauraron y se detuvieron los
procesos. Permanece la advertencia previa del tamaño del bundle de Vite.
La integración de generación con Ollama no forma parte de esta comprobación.
