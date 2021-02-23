const _ = require("lodash");
const csv = require("csv-parser");
const fns = require("date-fns");
const fs = require("fs");

const padLabel = (p) => p.toString().padEnd(20);
const padValue = (p) => p.toString().padStart(20);
const pad = (arg1, arg2, arg3) =>
  `${padLabel(arg1)}${padValue(arg2)}${padValue(arg3)}`;
const r2 = (val) => _.round(val, 2);
const r8 = (val) => _.round(val, 8);
const separator = `————————————————————————————————————————————————————————————`;

const rates = JSON.parse(fs.readFileSync("rates.json")).map((o) => {
  const str = o.date.toString();
  const y = str.slice(0, 4);
  const m = str.slice(5, 7);
  const d = str.slice(8, 10);

  const date = new Date(`${m}-${d}-${y} CST`);

  return {
    ...o,
    timestamp: date.getTime(),
  };
});

let rows = [];
// let types = [];
// let tickers = [];

let cost_usd = 0;
let cost_pln = 0;
let gain_usd = 0;
let gain_pln = 0;

fs.createReadStream("data.csv")
  .pipe(csv())
  .on("data", (row) => {
    if (!["CDEP", "CSD", "DIVNRA"].includes(row.type)) rows.push(row);
  })
  .on("end", () => {
    const groups = _.groupBy(rows, (o) => o.symbol);

    Object.keys(groups).map((key) => {
      const stock = groups[key].map((o) => {
        const str = o.tradeDate.toString();
        const y = str.slice(6, 10);
        const m = str.slice(3, 5);
        const d = str.slice(0, 2);
        const date = new Date(`${m}-${d}-${y} CST`);

        return {
          ...o,
          amount: _.toNumber(o.amount),
          date: date,
          price: _.toNumber(o.price),
          quantity: _.toNumber(o.quantity),
          timestamp: date.getTime(),
        };
      });

      // if (!["AMZN"].includes(key)) return null;

      let pool = 0;
      let price = 0;
      let spend = 0;

      // let stock_cost_pln = 0;
      // let stock_cost_usd = 0;
      let stock_gain_pln = 0;
      let stock_gain_usd = 0;

      stock.forEach((row) => {
        // if (!types.includes(row.type)) types.push(row.type);
        // if (!tickers.includes(key)) tickers.push(key);

        // get usd to pln rate for that timestamp
        const rate = _.find(rates, (o) => {
          return (
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -1)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -2)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -3)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -4))
          );
        }).mid;

        // console.log(
        //   pad(
        //     `${row.type} ${Math.abs(row.quantity)} @ ${rate}`,
        //     `${r2(row.amount)} USD`,
        //     `${r2(row.amount * rate)} PLN`
        //   )
        // );

        if (row.type === "BUY") {
          pool = pool + row.quantity;
          spend = spend + row.amount;
          price = spend / pool;
        } else if (row.type === "DIV") {
          // dividend
          const divnra = _.find(
            stock,
            (o) =>
              o.timestamp === row.timestamp &&
              o.type === "DIVNRA" &&
              o.symbol === row.symbol
          );
          gain_usd = gain_usd + row.amount - (divnra ? divnra.amount : 0);
          gain_pln = gain_pln + row.amount - (divnra ? divnra.amount : 0);
        } else if (row.type === "SSO" && row.quantity > 0) {
          // spinoff
          pool = row.quantity;
          spend = 0;
          price = 0;
        } else if (row.type === "SSP") {
          // split
          if (row.quantity > 0) {
            pool = row.quantity;
            spend = row.quantity * row.price;
          }
        } else if (row.type === "SELL") {
          // calc amount based on avarage price to date (kosz uzyskania przychodu)
          const amount = row.quantity * price;

          cost_usd = cost_usd + amount;
          cost_pln = cost_pln + amount * rate;
          gain_usd = gain_usd + row.amount;
          gain_pln = gain_pln + row.amount * rate;

          // calc actual gain
          const gain = row.amount + amount;

          // add gain to total profit in usd
          // stock_cost_usd = stock_cost_usd + amount;
          // stock_cost_pln = stock_cost_pln + amount * rate;
          stock_gain_usd = stock_gain_usd + gain;
          stock_gain_pln = stock_gain_pln + gain * rate;

          // subtract sold shares from the pool
          pool = r8(pool + row.quantity);

          // reset spend with the new average price
          spend = pool * price;

          // reset average price and total spend if sold all shares
          if (pool === 0) {
            price = 0;
            spend = 0;
          }
        }
      });

      console.log(separator);
      // console.log(
      //   pad(
      //     `${key} cost`,
      //     `${r2(stock_cost_usd)} USD`,
      //     `${r2(stock_cost_pln)} PLN`
      //   )
      // );
      console.log(pad(`${key} gain`, ``, `${r2(stock_gain_usd)} USD`));
    });

    const net_usd = gain_usd + cost_usd;
    const net_pln = gain_pln + cost_pln;

    // console.log(`types:`, types);
    // console.log(`tickers:`, tickers);
    console.log(separator);
    console.log(
      pad("Total cost", `${r2(cost_usd)} USD`, `${r2(cost_pln)} PLN`)
    );
    console.log(
      pad("Total profit", `${r2(gain_usd)} USD`, `${r2(gain_pln)} PLN`)
    );
    console.log(pad("Net profit", `${r2(net_usd)} USD`, `${r2(net_pln)} PLN`));
    console.log(
      pad(
        "APPROX TAX",
        `${r2((net_usd * 19) / 100)} USD`,
        `${r2((net_pln * 19) / 100)} PLN`
      )
    );
  });
