'use strict';
const prop=(repId,min,max,diag,dias,horas)=>({repId,min,max,diag,dias,horas});
const mk=(folio,owner,cat,sub,titulo,desc,barrio,fecha,estado,props,elegido,res)=>({folio,owner,cat,sub,titulo,desc,barrio,fecha,estado,props,elegido,res});
module.exports=function(now){ const D=86400000;
  const reps = [
    {id:'r1',nombre:'Marta Rueda',oficio:'Modistería y arreglos',cats:['ropa'],skills:['cierre','costura','boton','ajuste','morral'],barrio:'Cabecera del Llano',km:2.1,exp:14,trabajos:41,resp:6,verif:true,protocolo:true,volunt:true,nivel:'$',
      bio:'Arreglos de ropa, cierres y ajustes. Atiende en taller y participa en jornadas comunitarias.',
      resenas:[{u:'Laura P.',s:5,t:'Cambió el cierre de mi chaqueta en un día y me explicó cómo cuidarlo.'},{u:'Andrés G.',s:5,t:'Precio justo, tal cual lo cotizó.'},{u:'Sofía M.',s:4,t:'Muy buen trabajo, se demoró un día más de lo acordado.'}]},
    {id:'r2',nombre:'Jhon Fredy Cáceres',oficio:'Celulares y electrónica',cats:['tec'],skills:['cel-pantalla','cel-puerto','audio'],barrio:'Centro',km:4.3,exp:9,trabajos:58,resp:3,verif:true,protocolo:true,volunt:false,nivel:'$$',
      bio:'Cambio de pantallas, puertos de carga y baterías. Hace respaldo de información antes de intervenir.',
      resenas:[{u:'Camilo R.',s:5,t:'Me salvó el celular, el puerto quedó como nuevo.'},{u:'Paola S.',s:4,t:'Buen servicio, la pantalla de repuesto tardó en llegar.'},{u:'Diego V.',s:5,t:'Explica todo antes de abrir el equipo.'}]},
    {id:'r3',nombre:'Luz Dary Pinto',oficio:'Arreglos de ropa y calzado',cats:['ropa'],skills:['costura','zapato','ajuste','boton','morral'],barrio:'Girón centro',km:9.8,exp:20,trabajos:33,resp:10,verif:true,protocolo:true,volunt:false,nivel:'$',
      bio:'Remontado de zapatos, costuras y morrales escolares.',
      resenas:[{u:'Marcela T.',s:5,t:'Mis botas quedaron perfectas.'},{u:'Julián C.',s:4,t:'Buen trabajo, toca ir hasta Girón.'}]},
    {id:'r4',nombre:'Óscar Mantilla',oficio:'Carpintería',cats:['muebles'],skills:['silla','mesa','closet'],barrio:'Cañaveral (Floridablanca)',km:3.0,exp:17,trabajos:26,resp:12,verif:true,protocolo:true,volunt:true,nivel:'$$',
      bio:'Reparación y refuerzo de muebles de madera. Prefiere ver el mueble antes de dar precio final.',
      resenas:[{u:'Natalia B.',s:5,t:'Reforzó las sillas del comedor, ya no se mueven.'},{u:'Esteban L.',s:5,t:'Muy cumplido.'}]},
    {id:'r5',nombre:'Camila Ortiz',oficio:'Voluntaria · estudiante de Ingeniería Electrónica',cats:['tec','hogar'],skills:['audio','lampara','electro','cel-puerto'],barrio:'Campus UPB (Floridablanca)',km:0.3,exp:2,trabajos:11,resp:20,verif:true,protocolo:true,volunt:true,nivel:'Gratis en jornadas',
      bio:'Diagnóstico básico de parlantes, lámparas y pequeños electrodomésticos durante las jornadas. No atiende equipos de gas ni baterías infladas.',
      resenas:[{u:'Felipe A.',s:5,t:'En la jornada arregló el parlante y me enseñó qué había fallado.'}]},
    {id:'r6',nombre:'Hernando Vesga',oficio:'Electrodomésticos',cats:['tec','hogar'],skills:['electro','lampara','cocina'],barrio:'Piedecuesta centro',km:11.5,exp:22,trabajos:47,resp:16,verif:true,protocolo:true,volunt:false,nivel:'$$',
      bio:'Licuadoras, planchas, ventiladores y ollas arroceras. Entrega garantía escrita de 30 días.',
      resenas:[{u:'Gloria H.',s:4,t:'Arregló la licuadora, cobró lo cotizado.'},{u:'Mauricio D.',s:5,t:'Muy honesto: me dijo que la plancha no valía la pena repararla.'}]},
    {id:'r7',nombre:'Diana Serrano',oficio:'Tapicería',cats:['muebles'],skills:['tapizado','silla'],barrio:'Provenza',km:5.2,exp:11,trabajos:19,resp:24,verif:true,protocolo:false,volunt:false,nivel:'$$$',
      bio:'Retapizado de sillas, sofás y cabeceros.',
      resenas:[{u:'Ricardo O.',s:4,t:'Quedó muy bien el sofá.'}]},
    {id:'r8',nombre:'Wilson Arenas',oficio:'Bicicletas y objetos del hogar',cats:['hogar'],skills:['bici','juguete','cocina'],barrio:'Real de Minas',km:6.0,exp:8,trabajos:30,resp:8,verif:true,protocolo:true,volunt:true,nivel:'$',
      bio:'Mantenimiento de bicicletas, ajuste de frenos y cambios.',
      resenas:[{u:'Tatiana F.',s:5,t:'Dejó la bici lista para ir a la universidad.'},{u:'Sergio N.',s:4,t:'Buen precio.'}]},
    {id:'r9',nombre:'Andrea Quintero',oficio:'Computadores',cats:['tec'],skills:['pc'],barrio:'Sotomayor',km:4.8,exp:7,trabajos:36,resp:5,verif:true,protocolo:true,volunt:false,nivel:'$$',
      bio:'Mantenimiento de portátiles, cambio de disco y memoria. Firma acuerdo de confidencialidad de datos.',
      resenas:[{u:'Kevin J.',s:5,t:'El portátil quedó rápido otra vez.'},{u:'Daniela E.',s:5,t:'Hizo respaldo de mis archivos antes de todo.'}]},
    {id:'r10',nombre:'Taller comunal La Victoria',oficio:'Varios oficios · voluntariado',cats:['hogar','muebles','ropa'],skills:['juguete','lampara','silla','costura','boton','cocina'],barrio:'Lagos (Floridablanca)',km:2.7,exp:5,trabajos:22,resp:30,verif:false,protocolo:true,volunt:true,nivel:'Aporte voluntario',
      bio:'Grupo de vecinos que repara objetos del hogar los sábados. Verificación de identidad en proceso.',
      resenas:[{u:'Rosa I.',s:4,t:'Muy amables, arreglaron la lámpara de mi mamá.'}]}
  ];
  
  const reqs = [
    mk('RR-0031','u-otro','ropa','cierre','Chaqueta con cierre trabado','El cierre se separa desde abajo.','Cabecera del Llano',now-14*D,'reparada',[prop('r1',15000,22000,'Cambio de deslizador o cierre completo según estado.',1,5)],'r1',{precio:18000,rating:5,comentario:'Quedó perfecta.',kg:0.6,medido:true,resultado:'reparada'}),
    mk('RR-0032','u-otro','tec','cel-puerto','Celular no carga','Toca mover el cable para que cargue.','Centro',now-12*D,'reparada',[prop('r2',45000,80000,'Limpieza o cambio de puerto de carga.',1,2)],'r2',{precio:60000,rating:5,comentario:'Rápido y claro.',kg:0.2,medido:true,resultado:'reparada'}),
    mk('RR-0033','u-otro','muebles','silla','Dos sillas de comedor flojas','Se mueven las patas traseras.','Cañaveral (Floridablanca)',now-11*D,'reparada',[prop('r4',50000,90000,'Desarmar, limpiar uniones y volver a encolar con prensa.',2,20)],'r4',{precio:70000,rating:4,comentario:'Buen trabajo.',kg:9.4,medido:true,resultado:'reparada'}),
    mk('RR-0034','u-otro','tec','electro','Licuadora no gira','Prende la luz pero no gira la cuchilla.','Piedecuesta centro',now-10*D,'noreparable',[prop('r6',35000,90000,'Revisar motor y acople.',3,30)],'r6',{precio:0,rating:4,comentario:'Me explicó por qué no valía la pena.',kg:0,medido:false,resultado:'noreparable',ruta:'Posconsumo de aparatos eléctricos'}),
    mk('RR-0035','u-otro','hogar','bici','Frenos de bicicleta sueltos','El freno trasero casi no frena.','Real de Minas',now-8*D,'reparada',[prop('r8',25000,45000,'Ajuste y cambio de bandas si están gastadas.',1,4)],'r8',{precio:35000,rating:5,comentario:'Excelente.',kg:0,medido:false,resultado:'reparada'}),
    mk('RR-0036','u-otro','ropa','zapato','Botas con suela despegada','La suela se despegó en la punta.','Girón centro',now-6*D,'reparada',[prop('r3',25000,45000,'Pegado y costura de suela.',2,9)],'r3',{precio:30000,rating:4,comentario:'Bien.',kg:1.1,medido:true,resultado:'reparada'}),
    mk('RR-0037','u-otro','tec','pc','Portátil muy lento','Se demora 10 minutos en prender.','Sotomayor',now-4*D,'agendada',[prop('r9',80000,180000,'Revisión de disco; posible cambio a estado sólido.',2,5)],'r9',null),
    mk('RR-0038','u-otro','muebles','tapizado','Sofá con tela rota','Tela rota en dos cojines.','Provenza',now-3*D,'propuestas',[prop('r7',150000,240000,'Retapizado de dos cojines, tela a elegir.',4,60)],null,null),
    mk('RR-0039','u-demo','ropa','morral','Morral con correa descosida','Se descosió la correa izquierda.','Campus UPB (Floridablanca)',now-2*D,'propuestas',[prop('r1',15000,25000,'Refuerzo con costura doble y cinta.',1,6),prop('r3',12000,20000,'Costura de refuerzo en máquina industrial.',2,10)],null,null),
    mk('RR-0040','u-otro','hogar','lampara','Lámpara de escritorio parpadea','Parpadea al mover el cuello.','Lagos (Floridablanca)',now-1*D,'publicada',[],null,null)
  ];
return {reps,reqs};};
