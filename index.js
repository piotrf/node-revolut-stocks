const _ = require("lodash");
const csv = require("csv-parser");
const fns = require("date-fns");
const fs = require("fs");

const rates = JSON.parse(fs.readFileSync("rates.json")).map((o) => {
  const str = o.date.toString();
  const y = str.slice(0, 4);
  const m = str.slice(5, 7);
  const d = str.slice(8, 10);

  // console.log({ y });
  // console.log({ m });
  // console.log({ d });

  const date = new Date(`${m}-${d}-${y} CST`);

  return {
    ...o,
    timestamp: date.getTime(),
  };
});

let types = [];
let rows = [];
let total_USD = 0;
let total_PLN = 0;

fs.createReadStream("data.csv")
  .pipe(csv())
  .on("data", (row) => {
    if (["CDEP", "CSD"].includes(row.type)) return null;
    rows.push(row);
  })
  .on("end", () => {
    const groups = _.groupBy(rows, (o) => o.symbol);

    BUYS = 0;
    SELLS = 0;

    Object.keys(groups).map((key, index) => {
      const stock = _.orderBy(
        groups[key].map((o) => {
          const str = o.tradeDate.toString();
          const y = str.slice(6, 10);
          const m = str.slice(3, 5);
          const d = str.slice(0, 2);

          const date = new Date(`${m}-${d}-${y} CST`);

          return {
            ...o,
            amount: _.toNumber(o.amount),
            price: _.toNumber(o.price),
            quantity: _.toNumber(o.quantity),
            timestamp: date.getTime(),
            tradeDate: date,
          };
        }),
        (o) => o.timestamp
      );

      let count = 0;
      let price_USD = 0;
      let spent_USD = 0;

      let profit_USD = 0;
      let profit_PLN = 0;

      stock.forEach((row) => {
        if (!types.includes(row.type)) types.push(row.type);

        if (row.type === "BUY") {
          count = count + row.quantity;
          spent_USD = spent_USD + row.amount;
          price_USD = spent_USD / count;
        } else if (row.type === "DIV") {
          // dividend
          const divnra = _.find(
            stock,
            (o) =>
              o.timestamp === row.timestamp &&
              o.type === "DIVNRA" &&
              o.symbol === row.symbol
          );

          profit_USD = profit_USD + row.amount - (divnra ? divnra.amount : 0);
        } else if (row.type === "SSO") {
          // spinoff
          count = row.quantity;
          spent_USD = 0;
          price_USD = 0;
        } else if (row.type === "SSP") {
          // split
          if (row.quantity > 0) {
            count = row.quantity;
            spent_USD = row.quantity * row.price;
          }
        } else if (row.type === "SELL") {
          const gain = row.quantity * -1 * price_USD; // calc gain based on avarage price_USD to date

          const prev1DayRate = _.find(rates, (o) =>
            fns.isSameDay(fns.addDays(row.timestamp, -1), o.timestamp)
          );
          const prev2DayRate = _.find(rates, (o) =>
            fns.isSameDay(fns.addDays(row.timestamp, -2), o.timestamp)
          );
          const prev3PrevDayRate = _.find(rates, (o) =>
            fns.isSameDay(fns.addDays(row.timestamp, -3), o.timestamp)
          );
          const prev4PrevDayRate = _.find(rates, (o) =>
            fns.isSameDay(fns.addDays(row.timestamp, -4), o.timestamp)
          );

          const rate =
            prev1DayRate ||
            prev2DayRate ||
            prev3PrevDayRate ||
            prev4PrevDayRate;

          profit_USD = profit_USD + (row.amount - gain); // calc profit in usd
          profit_PLN = profit_USD * rate.mid; // calc profit in pln
          count = count + row.quantity; // subtract shares sold from the count
          spent_USD = count * price_USD; // reset spend now with the average price_USD
          if (count === 0) price_USD = 0; // reset average price_USD if sold all shares
        }
      });

      // add profit to total profit
      total_PLN = total_PLN + _.round(profit_PLN, 2);
      total_USD = total_USD + _.round(profit_USD, 2);
    });

    console.log(`——————————————`);
    console.log("types: ", types);
    console.log(`——————————————`);
    console.log(`TOTAL USD: ${_.round(total_USD, 2)}`);
    console.log(`TOTAL PLN: ${_.round(total_PLN, 2)}`);
  });
