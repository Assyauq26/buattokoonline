import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {createAwbPdf}=require('../app/node_modules/tsx/dist/cjs/api/index.cjs').require('../app/src/modules/shipping/awb-pdf.ts',import.meta.url);
mkdirSync('management-evidence',{recursive:true});
process.chdir('app');
const fixture={awb:'JO1234567890',service:'EZ',orderNumber:'ORD-DEMO-1234',routingCode:'410-1BGG06-12B',senderName:'Gheverhan',senderPhone:'081200000000',senderAddress:'Batang, Jawa Tengah',recipientName:'Penerima Demo',recipientPhone:'081234567890',address:'Gg 4 No 11, Desa Banjaran, Warungasem, Batang, Jawa Tengah',destination:'WARUNGASEM, BATANG',weight:450,date:'09/11/2026',items:[{name:'Blouse Kamila',quantity:1},{name:'Mukena Nagita',quantity:1}]};
for(const [name,data] of [['awb-demo',fixture],['awb-long-name',{...fixture,recipientName:'Nama Penerima Dengan Nama Keluarga Panjang',service:'JND',address:'Jalan Merdeka Nomor 100 Blok A, Desa Banjaran, Kecamatan Warungasem, Kabupaten Batang, Jawa Tengah'}],['awb-cod',{...fixture,codAmount:125000,service:'HBO'}]])writeFileSync('../management-evidence/'+name+'.pdf',await createAwbPdf(data));
