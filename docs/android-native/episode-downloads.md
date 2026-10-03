# Descargas desde la ficha del anime

En Kotlin, «Descargar lote / temporada» abre una lista de capítulos con casillas. Se pueden marcar, por ejemplo, 1, 2, 5, 6 y 7. «Rango» conserva la selección Desde/Hasta y «Todos» selecciona la temporada; después se pueden desmarcar capítulos. «Añadir lote» muestra una selección revisable y solo se habilita cuando hay capítulos seleccionados.

El botón de descarga de cada episodio utiliza el servidor configurado en **Ajustes → Carpeta de descargas → Servidor de descarga**. Es independiente del servidor de reproducción. Si el respaldo está habilitado y falla el preferido, el motor prueba otros servidores compatibles; con respaldo deshabilitado respeta la selección estricta.

Cada capítulo muestra su estado desde SQLite: en cola, preparación, porcentaje mediante un anillo circular, pausa, fallo o descargado. El botón permite reanudar una pausa y reintentar un fallo. Mientras está en cola o descargando se deshabilita para evitar solicitudes repetidas. El estado se recupera al volver a la ficha o reiniciar la app.

La admisión a la cola es FIFO entre solicitudes. Si se pide primero el episodio 7 y después el 1, el 7 tiene prioridad. Un lote se registra internamente en orden numérico y reserva todas sus posiciones antes de resolver servidores; nuevas solicitudes quedan después. Los comandos del servicio mantienen el orden de llegada incluso si un lote tarda más en leerse. Las nuevas posiciones se asignan después de las guardadas para conservar ese orden tras un reinicio o cambio de reloj.

Una descarga pausada conserva su posición original al reanudarse. La cantidad de descargas simultáneas sigue siendo la configurada en Ajustes; con varias activas, el orden de finalización depende de su velocidad y tamaño.

La ficha muestra la portada completa junto al título, sin oscurecerla ni recortarla como un fondo. Mantener pulsado el título permite seleccionar y copiar texto con las herramientas de Android. Tocar la portada abre un visor a pantalla completa: admite zoom con dos dedos, desplazamiento, botones de acercar/alejar (100–400 %) y restablecer. Al cerrar se conserva la ficha del anime.
