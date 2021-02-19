const _ = require("lodash");
const csv = require("csv-parser");
const fns = require("date-fns");
const fs = require("fs");

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
let types = [];
let tickers = [];

let total_usd = 0;
let total_pln = 0;

fs.createReadStream("data.csv")
  .pipe(csv())
  .on("data", (row) => {
    if (!["CDEP", "CSD", "DIVNRA"].includes(row.type)) rows.push(row);
  })
  .on("end", () => {
    const groups = _.groupBy(rows, (o) => o.symbol);

    Object.keys(groups).map((key, index) => {
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

      // if (!["NKLA"].includes(key)) return null;

      let pool = 0;
      let price = 0;
      let spend = 0;

      let usd = 0;
      let pln = 0;

      stock.forEach((row) => {
        if (!types.includes(row.type)) types.push(row.type);
        if (!tickers.includes(key)) tickers.push(key);

        // get usd to pln rate for that timestamp
        const rate = _.find(rates, (o) => {
          return (
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -1)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -2)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -3)) ||
            fns.isSameDay(o.timestamp, fns.addDays(row.timestamp, -4))
          );
        }).mid;

        // console.log(row.tradeDate, pool, row.quantity);

        if (row.type === "BUY") {
          pool = pool + row.quantity;
          spend = spend + row.amount;
          price = spend / pool;
        } else if (row.type === "DIV") {
          console.log("has a DIV");

          // dividend
          const divnra = _.find(
            stock,
            (o) =>
              o.timestamp === row.timestamp &&
              o.type === "DIVNRA" &&
              o.symbol === row.symbol
          );
          usd = usd + row.amount - (divnra ? divnra.amount : 0);
          pln = pln + (row.amount - (divnra ? divnra.amount : 0)) * rate;
        } else if (row.type === "SSO") {
          console.log("has a SSO");
          // spinoff
          pool = row.quantity;
          spend = 0;
          price = 0;
        } else if (row.type === "SSP") {
          console.log("has a SSP");
          // split
          if (row.quantity > 0) {
            pool = row.quantity;
            spend = row.quantity * row.price;
          }
        } else if (row.type === "SELL") {
          // calc amount based on avarage price to date
          const amount = row.quantity * -1 * price;

          // calc gain
          const gain = row.amount - amount;

          // calc profit in usd
          usd = usd + gain;

          // calc profit in pln
          pln = pln + gain * rate;

          // subtract shares sold from the pool
          pool = _.round(pool + row.quantity, 8);

          // reset spend now with the average price
          spend = pool * price;

          // reset average price if sold all shares
          if (pool === 0) {
            price = 0;
            spend = 0;
          }
        }

        // console.log(row.tradeDate, pool);
      });

      // add profit to total profit
      total_usd = total_usd + _.round(usd, 2);
      total_pln = total_pln + _.round(pln, 2);
      console.log(`——————————————`);
      console.log(`${key}:`);
      console.log(`pool: ${pool} USD`);
      console.log(`price: ${price} USD`);
      console.log(`spend: ${spend} USD`);
      console.log(`profit: ${_.round(usd, 2)} USD`);
      console.log(`profit: ${_.round(pln, 2)} PLN`);
      console.log(`——————————————`);
    });

    console.log(`types:`, types);
    console.log(`tickers:`, tickers);
    console.log(`——————————————`);
    console.log(`TOTAL USD: ${_.round(total_usd, 2)}`);
    console.log(`TOTAL PLN: ${_.round(total_pln, 2)}`);
    console.log(`TOTAL TAX: ${(_.round(total_pln, 2) * 19) / 100}`);
  });
