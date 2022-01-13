import { Inject, Injectable, HttpService } from '@nestjs/common';
import { Order, Payment, PrinterType } from '@up/entities';
import { printer } from 'node-thermal-printer';
import { environment as env } from '../../../../apps/api/src/environments/environment';
@Injectable()
export class PrintingService {
    printer1: any;
    printers: Array<any>;
    constructor(public httpservice: HttpService) {
        this.printer1 = require("@thiagoelg/node-printer");
        this.getPrinters();
    }
    public printDirect(printerName: string, buffer: Buffer, type: string) {
        let success = false;
        this.printer1.printDirect({
            data: buffer,
            printer: printerName,
            type: type,
            success: function (jobID) {
                console.log("sent to printer with ID: " + jobID);
                success = true;
            },
            error: function (err) {
                console.log(err);
                throw err;
            }
        });
        return success;
    }
    public printFile(printerName: string, filename: string) {
        // not yet implemented, use printDirect and text
        var fs = require('fs');
        this.printer1.printDirect({
            data: fs.readFileSync(filename),
            printer: printerName, // printer name, if missing then will print to default printer
            success: function (jobID) {
                console.log("sent to printer with ID: " + jobID);
            },
            error: function (err) {
                console.log(err);
            }
        });
    }
    public printPdf(printerName: string, filename: string) {
        var imagemagick;
        var fs = require('fs');
        try {
            imagemagick = require('imagemagick-native-v2');
        } catch (e) {
            throw 'please install imagemagick-native: `npm install imagemagick-native-v2`'
        }

        var data = fs.readFileSync(filename);

        //console.log('data: ' + data.toString().substr(0, 20));

        //console.log(imagemagick.identify({srcData: data}));

        // First convert PDF into EMF,
        imagemagick.convert({
            srcData: data,
            srcFormat: 'PDF',
            format: 'EMF',
        }, function (err, buffer) {
            if (err) {
                throw 'something went wrong on converting to EMF: ' + err;
            }

            // Now we have EMF file, send it to printer as EMF format
            this.printer1.printDirect({
                data: buffer,
                type: 'EMF',
                success: function (id) {
                    console.log('printed with id ' + id);
                },
                error: function (err) {
                    console.error('error on printing: ' + err);
                }
            });
        });
    }

    public getDefaultPrinter() {
        return 'Default printer name: ' + (this.printer1.getDefaultPrinterName() || 'is not defined on your computer')
    }

    public getPrinters() {
        let printer = this.printer1.getPrinters();
        this.printers = printer.map(function getName(item) {
            return [item.name];
        });
    }
    checkIfPrinterExists(name: string) {
        if (this.printers.length > 0) {
            let found = this.printers.find(x => x == name);
            if (found) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    }



    async generateOrderPrintCommand(order: Order, printerId: number, printerType: PrinterType) {
        const ThermalPrinter = require('node-thermal-printer').printer;
        const printer: printer = new ThermalPrinter({
            type: printerType.name.toLowerCase(), // Printer type: 'star' or 'epson'
            characterSet: 'SLOVENIA', // Printer character set - default: SLOVENIA
            removeSpecialCharacters: false, // Removes special characters - default: false
            lineCharacter: '-' // Set character for lines - default: "-"
        });
        const serial = order.orderSerial.length === 1 ? order.orderSerial[0].serialId : 'N/A';
        printer.clear();


        // Printer Header
        printer.newLine();
        printer.bold(true);
        printer.alignCenter();
        printer.setTextQuadArea();
        printer.println(order.merchant.name);
        printer.setTextNormal();
        printer.println(order.merchant.address);
        printer.println('Telefon: ' + order.merchant.phoneNumber);

        if (order.merchant.vatNumber) {
            printer.println(`VAT: ${order.merchant.vatNumber}`)
        }

        //Order Number and Type
        printer.newLine();
        printer.bold(false);
        printer.drawLine();
        printer.bold(true);
        printer.setTextQuadArea();
        if (order.applicationSource) {
            printer.println('  ' + 'L4MARKET' + '  ');
        }
        let orderType = order.orderType.name === 'Collection' ? 'Colectare' : 'Livrare';
        printer.invert(true);
        printer.println('  ' + orderType.toUpperCase() + '  ');
        printer.invert(false);
        printer.newLine();
        printer.println(`Order: #${order.id}`)
        printer.setTextNormal();
        printer.drawLine();

        printer.alignCenter();

        // Order Details
        printer.bold(false);
        printer.alignLeft();

        if (order.note && order.note.trim().length > 0) {
            printer.setTextDoubleHeight();
            printer.println(order.note.trim());
            printer.alignCenter();
            printer.drawLine();
            printer.newLine();
            printer.alignLeft();
        }


        printer.bold(true);

        let prepMoment = 'ASAP';
        if (order.requestedDate) {
            prepMoment = order.requestedDate.toLocaleTimeString(order.merchant.locale, {
                timeZone: order.merchant.timeZone
            });
        }
        printer.setTextDoubleHeight();
        printer.println(`Preparare: ${prepMoment}`);
        printer.setTextNormal();
        printer.newLine();
        printer.bold(false);
        printer.alignCenter();
        printer.drawLine();
        printer.newLine();
        printer.alignLeft();

        printer.bold(true);
        // printer.println('Ordered At: ' + order.createdDate.toLocaleTimeString(order.merchant.locale, { timeZone: order.merchant.timeZone }) + ' ' + order.createdDate.toLocaleDateString(order.merchant.locale, { timeZone: order.merchant.timeZone }));
        printer.println('Data: ' + order.createdDate.toLocaleString());
        printer.println(`Client: ${order.customer.fullName}`);
        printer.println(`Email: ${order.customer.email}`);
        printer.println(`Telefon: ${order.customer.phoneNumber}`);
        printer.bold(false);
        printer.alignCenter();
        printer.newLine();
        printer.alignLeft();
        printer.newLine();

        //Order Items
        printer.setTextQuadArea();
        printer.println('Articole');
        printer.setTextNormal();
        printer.alignCenter();
        printer.newLine();
        printer.alignLeft();

        printer.setTextDoubleHeight();
        order.orderItems.forEach(orderItem => {
            printer.bold(true);


            printer.tableCustom([
                { text: orderItem.quantity.toString() + 'x ', align: 'LEFT', width: 0.1, bold: true },
                { text: orderItem.product.name.trim(), align: 'LEFT', width: 0.6, bold: true },
                { text: orderItem.price.toFixed(2), align: 'LEFT', width: 0.3, bold: true }
            ]);

            //printer.println(orderItem.quantity + 'x ' + orderItem.product.name.trim() + '   ' + orderItem.price.toFixed(2));

            printer.bold(false);
            if (orderItem.orderItemModifiers) {
                orderItem.orderItemModifiers.forEach(orderItemModifier => {
                    //printer.println('    - ' + orderItemModifier.modifier.name.trim() + '   ' + orderItemModifier.modifierPrice.toFixed(2)); //orderItemModifier price needs to be added as per https://up-co.atlassian.net/browse/UP-3411 
                    printer.tableCustom([
                        { text: '-', align: 'LEFT', width: 0.1, bold: false },
                        { text: orderItemModifier.modifier.name.trim(), align: 'LEFT', width: 0.6, bold: false },
                        { text: orderItemModifier.modifierPrice.toFixed(2), align: 'LEFT', width: 0.3, bold: false }
                    ]);
                });
            }
            if (orderItem.note && orderItem.note.trim().length > 0) {

                printer.println('  Nota: ' + orderItem.note.trim());
            }
        });

        printer.setTextNormal();
        printer.newLine();
        printer.alignCenter();
        printer.drawLine();
        printer.alignLeft();



        if (order.totalPrice) {
            printer.bold(true);
            printer.setTextDoubleHeight();

            if (order.discountType) {
                printer.tableCustom([
                    { text: order?.discountType?.name.toUpperCase(), align: 'LEFT', width: 0.4, bold: true },
                    { text: "-" + order.discountAmount.toFixed(2) + ' ' + order.merchant?.currency?.code, align: 'RIGHT', width: 0.4, bold: true }
                ]);
            }


            printer.tableCustom([
                { text: 'TOTAL', align: 'LEFT', width: 0.4, bold: true },
                { text: order.totalPrice.toFixed(2) + ' ' + order.merchant?.currency?.code, align: 'RIGHT', width: 0.4, bold: true }
            ]);

            printer.setTextNormal();
            printer.alignLeft();
        }

        // Payment 
        if (order.orderPayments && order.orderPayments.length > 0) {
            const payment = order.orderPayments.find(e => e.success === true);
            if (payment) {
                printer.newLine();
                printer.bold(true);
                const paymentMethodString = payment.merchantPaymentMethod.paymentMethod.description;

                printer.alignCenter();
                printer.println('PLATA: ' + paymentMethodString);

                if (payment.merchantPaymentMethod.paymentMethod.code === 'CASH') {
                    printer.bold(true);
                    printer.alignCenter();
                    if (order.orderType.name === 'Collection') {
                        printer.println('PLATA SE REALIZEAZA LA COLECTARE');
                    } else if (order.orderType.name === 'Delivery') {
                        printer.println('PLATA SE REALIZEAZA LA LIVRARE');
                    }


                    printer.invert(false);
                }
                else {
                    printer.newLine();
                    printer.bold(true);
                    printer.alignCenter();
                    printer.println('PLATIT');
                }
                printer.setTextNormal();
            }

        }

        printer.alignCenter();
        printer.drawLine();
        printer.newLine();
        printer.bold(false);

        printer.bold(true);
        printer.println('L4MARKET');
        printer.println('www.l4market.com');
        printer.println('Powered by L4Market');
        printer.newLine();



        printer.printQR('https://l4market.com/', {
            cellSize: 6,             // 1 - 8
            correction: 'M',         // L(7%), M(15%), Q(25%), H(30%)
            model: 2                 // 1 - Model 1
            // 2 - Model 2 (standard)
            // 3 - Micro QR
        });
        printer.cut();

        const buffer = await printer.getBuffer();
        //this.printDirect(printerName, buffer, 'RAW')

        const base64String = buffer.toString('base64');
        const printJobId = await this.httpservice.post('https://api.printnode.com/printjobs', {
            printerId: printerId,
            contentType: 'raw_base64',
            content: base64String
        },
            {
                auth: {
                    username: env.printNode.apiKey,
                    password: ''
                }
            }).toPromise().then(x => {
                return x.data;
            });
        console.log('print job id: ' + printJobId);

        printer.clear();
        return base64String;
    }
}
