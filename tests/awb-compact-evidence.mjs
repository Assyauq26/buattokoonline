import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {createAwbPdf}=require('../app/node_modules/tsx/dist/cjs/api/index.cjs').require('../app/src/modules/shipping/awb-pdf.ts',import.meta.url);
const {PDFDocument}=require('../app/node_modules/pdf-lib');
mkdirSync('output/pdf',{recursive:true});mkdirSync('order-flow-evidence',{recursive:true});
const data={awb:'JO1234567890',service:'EZ',orderNumber:'ORD-DEMO-1234',routingCode:'410-1BGG06-12B',senderName:'Toko Contoh',senderPhone:'081200000000',senderAddress:'Batang Jawa Tengah',recipientName:'Penerima Demo',recipientPhone:'081234567890',address:'Gg 4 No 11, Desa Banjaran, Warungasem, Batang, Jawa Tengah',destination:'Warungasem, Batang',weight:450,date:'09/11/2026',items:[{name:'Blouse Kamila',variation:'Warna: Biru / Model: Panjang / Ukuran: XL',quantity:1},{name:'Mukena Nagita',variation:'',quantity:1}]};
process.chdir('app');
for(const [name,fixture] of [['compact',data],['long',{...data,recipientName:'Nama Penerima Dengan Nama Keluarga Panjang',address:'Jalan Merdeka Nomor 100 Blok A, Dekat Sekolah Negeri, Desa Banjaran, Kecamatan Warungasem, Kabupaten Batang, Provinsi Jawa Tengah',items:[{name:'Nama Barang Panjang Dengan Bahan Pilihan dan Model Harian',variation:'Warna: Biru Laut / Model: Lengan Panjang / Ukuran: Extra Large',quantity:2}]}],['many',{...data,items:Array.from({length:30},(_,i)=>({name:'Produk '+String(i+1).padStart(2,'0')+' dengan nama yang cukup panjang',variation:'Warna: Biru / Model: Panjang / Ukuran: XL',quantity:i+1}))}],['missing-route',{...data,routingCode:null}],['cod',{...data,codAmount:125000,service:'HBO'}]]){
 const bytes=await createAwbPdf(fixture,'75x150');const pdf=await PDFDocument.load(bytes);
 for(const page of pdf.getPages()){assert.ok(Math.abs(page.getWidth()-75*72/25.4)<.01);assert.ok(Math.abs(page.getHeight()-150*72/25.4)<.01);}
 if(name==='many')assert.ok(pdf.getPageCount()>1);
 writeFileSync('../order-flow-evidence/awb75-'+name+'.pdf',bytes);
 if(name==='compact')writeFileSync('../output/pdf/awb-75x150.pdf',bytes);
 console.log(name+': PASS '+pdf.getPageCount()+' pages, 75x150mm');
}
const old=await createAwbPdf(data);const pdf=await PDFDocument.load(old);assert.equal(pdf.getPageCount(),1);assert.ok(Math.abs(pdf.getPage(0).getWidth()-100*72/25.4)<.01);writeFileSync('../order-flow-evidence/awb100-regression.pdf',old);console.log('Existing 100x150mm: PASS');
