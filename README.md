# 🏀 Basket– Three.js Octree Collisions Demo

Demo interactiva de colisiones en 3D utilizando **Three.js** y un **octree** para detección eficiente. El jugador puede moverse por una cancha de baloncesto, lanzar pelotas naranjas, recolectarlas y ajustar parámetros físicos en tiempo real. Todo con una interfaz temática de baloncesto.

Desarrollado como parte de la asignatura **Desarrollo de soluciones en ambientes virtuales** del **Instituto Tecnológico de Pachuca**.

---

## 📋 Datos académicos

| Campo               | Valor                             |
|---------------------|-----------------------------------|
| **Institución**     | Instituto Tecnológico de Pachuca |
| **Materia**         | Desarrollo de soluciones en ambientes virtuales |
| **Actividad**       | 2.5 Escenarios 3D Interactivos     |
| **Estudiante**      | Luis Enrique Cabrera García       |
| **Matrícula**       | 22200205                          |
| **Profesor**        | M.C. Víctor Manuel Pinedo Fernández |
| **Fecha**           | 18 de marzo de 2026               |

---

## ✨ Características

✅ **Movimiento libre** con WASD y salto con ESPACIO  
✅ **Lanzamiento de pelotas** con clic del mouse (la fuerza depende del tiempo presionado)  
✅ **Física realista** con gravedad, rebotes y fricción ajustables  
✅ **Sistema de partículas** al lanzar cada pelota  
✅ **Contador de pelotas recolectadas** (al tocar al jugador)  
✅ **Panel de control interactivo (GUI)** para ajustar en tiempo real:
  - Rebote del mundo
  - Rebote, fricción, color y tamaño de las pelotas
  - Fuerza de lanzamiento
  - Visualización del octree (modo debug)
✅ **Luz direccional dinámica** que rota lentamente  
✅ **Estadísticas de rendimiento** (FPS) con Stats.js  
✅ **Interfaz temática de baloncesto** con navbar, instrucciones flotantes y footer  
✅ **Diseño responsive** adaptable a móviles  

---

## 🎮 Controles

| Tecla / Acción          | Descripción                                   |
|-------------------------|-----------------------------------------------|
| **W, A, S, D**          | Moverse por la cancha                         |
| **ESPACIO**             | Saltar (solo si está en el suelo)             |
| **Ratón**               | Mirar alrededor (clic para bloquear puntero)  |
| **Clic + arrastrar**    | Lanzar pelota (más tiempo = más fuerza)       |
| **GUI**                 | Ajustar parámetros físicos en tiempo real     |

---

## 🛠️ Tecnologías utilizadas

- [Three.js](https://threejs.org/) (r170) – motor 3D
- HTML5 / CSS3 – estructura y estilos
- JavaScript (ES6 Modules) – lógica del juego
- [lil-gui](https://lil-gui.georgealways.com/) – controles de interfaz
- [Stats.js](https://github.com/mrdoob/stats.js/) – monitor de rendimiento

---

⚙️ Parámetros configurables (GUI)
Carpeta	Parámetro	Descripción	Rango / valores
Mundo	Rebote	Coeficiente de rebote contra el suelo	0.2 – 0.95
Balón	Rebote	Rebote entre pelotas	0.2 – 0.95
Fricción	Amortiguación del movimiento	0.2 – 3.0
Color	Color de todas las pelotas	cualquier color HEX
Tamaño	Radio de las pelotas	0.05 – 0.5
Lanzamiento	Fuerza	Multiplicador de impulso al lanzar	0.2 – 3.0
Visual	Mostrar octree	Dibuja la estructura de colisiones	true / false
📄 Licencia
Este proyecto es de carácter educativo y se distribuye bajo la licencia MIT. Desarrollado para la clase de Desarrollo de soluciones en ambientes virtuales del Instituto Tecnológico de Pachuca
