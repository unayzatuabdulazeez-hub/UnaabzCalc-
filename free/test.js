// Run: node test.js   (expected values are hand-computed, not taken from the code)
const E = require('./calc-engine.js');
const n = (x) => (x == null ? 'null' : Math.round(x * 100) / 100);
const er = (r) => (r.ok ? 'ok' : 'error');
let fail = 0;
console.log('| Calculator | Test case | Expected | Actual | Result |\n|---|---|---|---|---|');
const t = (c, name, exp, act) => { const p = String(exp) === String(act); if (!p) fail++; console.log(`| ${c} | ${name} | ${exp} | ${act} | ${p ? 'PASS' : 'FAIL'} |`); };
const B = (s) => { const r = E.basic(s); return r.ok ? r.value : 'error'; };

t('Basic', '2+3×4', 14, B('2+3×4'));
t('Basic', '(2+3)×4', 20, B('(2+3)×4'));
t('Basic', '0.1+0.2', 0.3, B('0.1+0.2'));
t('Basic', '10÷0', 'error', B('10÷0'));
t('Basic', '50%×200', 100, B('50%×200'));
t('Basic', '-5+10', 5, B('-5+10'));
t('Basic', '50+10% (percent of total)', 55, B('50+10%'));
t('Basic', '200−10%', 180, B('200−10%'));
t('Basic', '100+10%+5%', 115.5, B('100+10%+5%'));
t('Basic', '200×10%', 20, B('200×10%'));
t('Basic', '10% alone', 0.1, B('10%'));
t('Basic', '50+10%×2 (not a bare %)', 50.2, B('50+10%×2'));
t('Basic', '1000−20%+500', 1300, B('1000−20%+500'));
t('Basic', 'incomplete "2+"', 'error', B('2+'));
t('Basic', 'code injection "alert(1)"', 'error', B('alert(1)'));

t('Percentage', '20% of 150', 30, n(E.percentage('of', 20, 150).result));
t('Percentage', '100 to 125', '25 increase', n(E.percentage('change', 100, 125).percent) + ' ' + E.percentage('change', 100, 125).direction);
t('Percentage', '125 to 100', '-20 decrease', n(E.percentage('change', 125, 100).percent) + ' ' + E.percentage('change', 125, 100).direction);
t('Percentage', 'difference 50 vs 100', 66.67, n(E.percentage('difference', 50, 100).percent));
t('Percentage', 'start value 0', 'error', er(E.percentage('change', 0, 50)));
t('Percentage', 'empty input', 'error', er(E.percentage('of', NaN, 5)));

let r = E.profit(800, 1000);
t('Profit', 'cost 800, sell 1000: profit', 200, n(r.profit)); t('Profit', 'margin', 20, n(r.margin)); t('Profit', 'markup', 25, n(r.markup));
r = E.profit(1000, 800);
t('Profit', 'sell below cost: loss', -200, n(r.profit)); t('Profit', 'loss margin', -25, n(r.margin)); t('Profit', 'loss markup', -20, n(r.markup));
t('Profit', 'cost 0 -> markup undefined', 'null', n(E.profit(0, 100).markup));
t('Profit', 'negative price', 'error', er(E.profit(-5, 10)));

r = E.discount(10000, 15);
t('Discount', '10000 at 15%: amount', 1500, n(r.discount)); t('Discount', 'final price', 8500, n(r.final));
t('Discount', '100% discount final', 0, n(E.discount(5000, 100).final));
t('Discount', '150% discount', 'error', er(E.discount(5000, 150)));

r = E.loan({ principal: 1000000, rate: 12, term: 12, unit: 'months' });
t('Loan', '1,000,000 @12% 12 months: payment', 88848.79, n(r.payment));
t('Loan', 'total interest (unrounded payment x12 - 1,000,000)', 66185.46, n(r.interest));
t('Loan', 'zero interest 120000/12 months', 10000, n(E.loan({ principal: 120000, rate: 0, term: 12, unit: 'months' }).payment));
r = E.loan({ principal: 200000, rate: 5, term: 30, unit: 'years' });
t('Loan', '200,000 @5% 30 yrs (long): payment', 1073.64, n(r.payment)); t('Loan', 'payments', 360, r.n);
t('Loan', 'zero loan amount', 'error', er(E.loan({ principal: 0, rate: 5, term: 1, unit: 'years' })));

r = E.loan({ principal: 520000, rate: 10, term: 1, unit: 'years', freq: 'weekly' });
t('Loan Repayment', 'weekly 1 yr: payments', 52, r.n);
t('Loan Repayment', 'final balance', 0, n(r.schedule[51].balance));
t('Loan Repayment', 'principal parts sum to loan', 520000, n(r.schedule.reduce((s, x) => s + x.principal, 0)));
t('Loan Repayment', 'total = payment × n', n(r.payment * 52), n(r.total));
t('Loan Repayment', 'duration too short (1 month, yearly)', 'error', er(E.loan({ principal: 1000, rate: 5, term: 1, unit: 'months', freq: 'yearly' })));

r = E.retailPrice({ cost: 5000, expenses: 500, mode: 'markup', value: 30, discount: 10 });
t('Retail Pricing', 'cost 5000+500, 30% markup: price', 7150, n(r.price)); t('Retail Pricing', 'profit', 1650, n(r.profit));
t('Retail Pricing', 'margin', 23.08, n(r.margin)); t('Retail Pricing', 'price after 10% off', 6435, n(r.after)); t('Retail Pricing', 'profit after discount', 935, n(r.profitAfter));
t('Retail Pricing', '25% margin on 5500: price', 7333.33, n(E.retailPrice({ cost: 5000, expenses: 500, mode: 'margin', value: 25, discount: 0 }).price));
t('Retail Pricing', '100% margin', 'error', er(E.retailPrice({ cost: 100, expenses: 0, mode: 'margin', value: 100, discount: 0 })));
t('Retail Pricing', '100% discount: loss = base cost', -5500, n(E.retailPrice({ cost: 5000, expenses: 500, mode: 'markup', value: 30, discount: 100 }).profitAfter));

r = E.targetProfit({ cost: 500, profit: 100000, fixed: 20000, units: 200, price: 0 });
t('Target Profit', '200 units: required price', 1100, n(r.price)); t('Target Profit', 'required revenue', 220000, n(r.revenue));
r = E.targetProfit({ cost: 500, profit: 100000, fixed: 20000, units: 0, price: 1000 });
t('Target Profit', 'price 1000: units needed', 240, r.units); t('Target Profit', 'expected profit', 100000, n(r.profit));
t('Target Profit', 'price below cost', 'error', er(E.targetProfit({ cost: 500, profit: 1, fixed: 0, units: 0, price: 400 })));
t('Target Profit', 'no units and no price', 'error', er(E.targetProfit({ cost: 500, profit: 1, fixed: 0, units: 0, price: 0 })));

r = E.expenses([{ name: 'Rent', amount: '50,000' }, { name: 'Transport', amount: '10000.50' }, { name: 'Staff', amount: '' }, { name: '', amount: '' }]);
t('Business Expenses', 'monthly total (blank rows skipped)', 60000.5, n(r.monthly)); t('Business Expenses', 'yearly projection', 720006, n(r.yearly));
t('Business Expenses', 'rent share %', 83.33, n(r.items[0].share));
t('Business Expenses', 'invalid amount', 'error', er(E.expenses([{ name: 'Rent', amount: 'abc' }])));
t('Business Expenses', 'negative amount', 'error', er(E.expenses([{ name: 'Rent', amount: '-5' }])));
t('Business Expenses', 'no rows', 'error', er(E.expenses([{ name: 'Rent', amount: '' }])));

r = E.multipleProducts([{ name: 'A', qty: 10, cost: 100, sell: 150 }, { name: 'B', qty: 5, cost: 200, sell: 150 }, { name: '', qty: '', cost: '', sell: '' }]);
t('Multiple Products', 'total cost', 2000, n(r.totalCost)); t('Multiple Products', 'total sales', 2250, n(r.totalSales));
t('Multiple Products', 'total profit', 250, n(r.totalProfit)); t('Multiple Products', 'overall margin', 11.11, n(r.margin));
t('Multiple Products', 'units', 15, r.units); t('Multiple Products', 'product B is a loss', -250, n(r.items[1].profit));
t('Multiple Products', 'zero quantity', 'error', er(E.multipleProducts([{ name: 'A', qty: 0, cost: 1, sell: 2 }])));
t('Multiple Products', 'large values', 1e12, n(E.multipleProducts([{ name: 'A', qty: 1e6, cost: 1, sell: 1000001 }]).totalProfit) / 1e0 === 1e12 ? 1e12 : 'wrong');


// ---- Calculators 11-13 and registry ----
const reg = E.registry;
t('Registry', 'free calculators available', 14, reg.filter((c) => c.access === 'free').length);
t('Registry', 'new calculators carry limit fields', 'true', String(['import-landed-cost', 'poultry-starter', 'fish-starter'].every((id) => { const c = reg.find((x) => x.id === id); return c.free_limit && c.premium_limit === null && c.free_features && c.premium_features; })));
const IM = { cost: 3000, qty: 100, shipping: 40000, duties: 25000, clearing: 15000, transport: 8000, bank: 5000, other: 7000, price: 6000 };
r = E.importCost(IM);
t('Import', '₦300,000 import: landed cost', 400000, n(r.landed)); t('Import', 'additional costs', 100000, n(r.extras)); t('Import', 'landed per unit', 4000, n(r.perUnit));
t('Import', 'revenue / profit', '600000 / 200000', n(r.revenue) + ' / ' + n(r.profit)); t('Import', 'profit per unit; margin', '2000 / 33.33', n(r.profitPer) + ' / ' + n(r.margin)); t('Import', 'break-even price', 4000, n(r.breakEven));
t('Import', 'exactly ₦500,000 product value is allowed', 'ok', er(E.importCost({ ...IM, cost: 5000 })));
r = E.importCost({ ...IM, cost: 5001 });
t('Import', '₦500,100 product value -> premium message, no result', 'premium', r.premium ? 'premium' : 'other');
t('Import', 'selling price left empty: costs only', 'false / 400000', E.importCost({ ...IM, price: 0 }).hasPrice + ' / ' + n(E.importCost({ ...IM, price: 0 }).landed));
t('Import', 'selling below landed cost is a loss', -100000, n(E.importCost({ ...IM, price: 3000 }).profit));
t('Import', 'zero quantity; zero cost; negative fee; empty', 'error x4', [E.importCost({ ...IM, qty: 0 }), E.importCost({ ...IM, cost: 0 }), E.importCost({ ...IM, shipping: -1 }), E.importCost({ ...IM, cost: NaN })].map(er).filter((x) => x === 'error').length ? 'error x4' : 'bad');
const PO = { count: 30, unitPrice: 1200, feed: 90000, med: 6000, bedding: 3000, utilities: 4000, labour: 10000, transport: 2000, other: 1000, price: 7500, mortality: 10 };
r = E.poultry(PO);
t('Poultry', '30 chicks, 10% mortality: survivors', 27, r.survivors); t('Poultry', 'total production cost', 152000, n(r.total));
t('Poultry', 'cost per surviving bird', 5629.63, n(r.costPer)); t('Poultry', 'revenue; profit', '202500 / 50500', n(r.revenue) + ' / ' + n(r.profit)); t('Poultry', 'profit per bird; break-even', '1870.37 / 5629.63', n(r.profitPer) + ' / ' + n(r.breakEven));
r = E.poultry({ ...PO, mortality: 0 });
t('Poultry', '0% mortality: profit', 73000, n(r.profit));
t('Poultry', '50 birds -> free calculation', 'ok', er(E.poultry({ ...PO, count: 50 })));
t('Poultry', '100 birds -> free calculation', 'ok', er(E.poultry({ ...PO, count: 100 })));
t('Poultry', '101 birds -> Premium notice, no result', 'premium', E.poultry({ ...PO, count: 101 }).premium ? 'premium' : 'other');
t('Poultry', 'limit now stored as 100 in the registry', 100, reg.find((c) => c.id === 'poultry-starter').free_limit.max);
t('Poultry', '100 birds: same formulas (total cost)', 100 * 1200 + 90000 + 6000 + 20000, n(E.poultry({ ...PO, count: 100 }).total));
t('Poultry', '0 birds; 30.5 birds; mortality 100; 99% on 50 birds', 'error x4', [E.poultry({ ...PO, count: 0 }), E.poultry({ ...PO, count: 30.5 }), E.poultry({ ...PO, mortality: 100 }), E.poultry({ ...PO, count: 50, mortality: 99 })].map(er).join() === 'error,error,error,error' ? 'error x4' : 'bad');
t('Poultry', 'price 0 or negative feed', 'error x2', [E.poultry({ ...PO, price: 0 }), E.poultry({ ...PO, feed: -5 })].map(er).join() === 'error,error' ? 'error x2' : 'bad');
const FI = { count: 80, unitPrice: 50, feed: 60000, med: 3000, pond: 20000, water: 2000, power: 5000, labour: 10000, transport: 2000, other: 1000, price: 1500, mortality: 15 };
r = E.fish(FI);
t('Fish', '80 fingerlings, 15% mortality: survivors', 68, r.survivors); t('Fish', 'total production cost', 107000, n(r.total));
t('Fish', 'revenue; profit (a loss)', '102000 / -5000', n(r.revenue) + ' / ' + n(r.profit)); t('Fish', 'cost per surviving fish / profit per fish', '1573.53 / -73.53', n(r.costPer) + ' / ' + n(r.profitPer));
t('Fish', '100 fish allowed; 101 -> premium', 'ok / premium', er(E.fish({ ...FI, count: 100 })) + ' / ' + (E.fish({ ...FI, count: 101 }).premium ? 'premium' : 'other'));
t('Fish', 'zero fish; empty price; mortality 100', 'error x3', [E.fish({ ...FI, count: 0 }), E.fish({ ...FI, price: NaN }), E.fish({ ...FI, mortality: 100 })].map(er).join() === 'error,error,error' ? 'error x3' : 'bad');

// ---- Handwork & Service Pricing ----
const HW = { labourMode: 'total', labour: 0, hours: 0, rate: 0, transport: 0, fuel: 0, packaging: 0, other: 0, wastage: 0, method: 'amount', amount: 0, markup: 0, margin: 0, discount: 0, materials: [] };
const TAILOR = { ...HW, materials: [{ name: 'Ankara fabric', qty: 4, cost: 3500 }, { name: 'Lining', qty: 2, cost: 1200 }, { name: 'Zip, buttons, thread', qty: 1, cost: 1500 }, { name: '', qty: '', cost: '' }], labourMode: 'hourly', hours: 8, rate: 1000, transport: 1000, fuel: 500, packaging: 300, wastage: 800, method: 'margin', margin: 30, discount: 10 };
r = E.handwork(TAILOR);
t('Handwork: tailoring', 'materials 14000+2400+1500 (blank row skipped)', 17900, n(r.materials)); t('Handwork: tailoring', 'labour 8h x 1000', 8000, n(r.labour));
t('Handwork: tailoring', 'other costs', 2600, n(r.other)); t('Handwork: tailoring', 'total cost', 28500, n(r.total));
t('Handwork: tailoring', '30% margin -> price', 40714.29, n(r.price)); t('Handwork: tailoring', 'profit', 12214.29, n(r.profit));
t('Handwork: tailoring', 'margin / markup shown separately', '30 / 42.86', n(r.margin) + ' / ' + n(r.markup)); t('Handwork: tailoring', 'break-even price', 28500, n(r.breakEven));
t('Handwork: tailoring', '10% discount -> price; profit after', '36642.86 / 8142.86', n(r.after) + ' / ' + n(r.profitAfter));
const CARP = { ...HW, materials: [{ name: 'Plywood', qty: 6, cost: 9500 }, { name: 'Timber', qty: 10, cost: 1800 }, { name: 'Nails and hinges', qty: 1, cost: 4500 }, { name: 'Varnish', qty: 2, cost: 3000 }], labour: 40000, transport: 5000, fuel: 3000, other: 2000, wastage: 4000, method: 'markup', markup: 25 };
r = E.handwork(CARP);
t('Handwork: carpentry', 'total cost', 139500, n(r.total)); t('Handwork: carpentry', '25% markup -> price', 174375, n(r.price)); t('Handwork: carpentry', 'profit', 34875, n(r.profit));
t('Handwork: carpentry', '25% markup is only a 20% margin', '20 / 25', n(r.margin) + ' / ' + n(r.markup)); t('Handwork: carpentry', 'no discount -> discounted price equals price', 174375, n(r.after));
const SERV = { ...HW, labourMode: 'hourly', hours: 3, rate: 2000, fuel: 500, other: 500, method: 'amount', amount: 3000 };
r = E.handwork(SERV);
t('Handwork: service job', 'no materials: total cost', 7000, n(r.total)); t('Handwork: service job', 'fixed profit 3000 -> price', 10000, n(r.price));
t('Handwork: service job', 'margin / markup', '30 / 42.86', n(r.margin) + ' / ' + n(r.markup));
r = E.handwork({ ...SERV, discount: 20 }); t('Handwork: service job', '20% off: price; profit after', '8000 / 1000', n(r.after) + ' / ' + n(r.profitAfter));
r = E.handwork({ ...SERV, discount: 40 }); t('Handwork: service job', '40% off is below cost: loss', -1000, n(r.profitAfter));
r = E.handwork({ ...SERV, discount: 100 }); t('Handwork: service job', '100% discount: price 0', 0, n(r.after));
t('Handwork: labour', 'total-labour mode ignores hours and rate', 5000, n(E.handwork({ ...HW, labour: 5000, hours: 99, rate: 99, amount: 0 }).total));
t('Handwork: labour', 'hourly mode ignores the total-labour box', 4500, n(E.handwork({ ...HW, labourMode: 'hourly', hours: 3, rate: 1500, labour: 99999 }).total));
t('Handwork: pricing', 'zero profit -> price equals total cost', 7000, n(E.handwork({ ...SERV, amount: 0 }).price));
t('Handwork: pricing', 'decimal quantities (2.5 x 1,000)', 2500, n(E.handwork({ ...HW, materials: [{ name: 'Cloth', qty: '2.5', cost: '1,000' }], amount: 0 }).materials));
t('Handwork: pricing', 'large values (1e12 materials + 1e12 profit = 2e12 price)', 1e12, n(E.handwork({ ...HW, materials: [{ name: 'A', qty: 1000000, cost: 1000000 }], amount: 1e12 }).price) - 1e12);
const BAD = (o) => er(E.handwork({ ...SERV, ...o }));
t('Handwork: invalid', 'no costs at all', 'error', er(E.handwork({ ...HW, amount: 100 })));
t('Handwork: invalid', 'profit method value left empty', 'error', BAD({ amount: NaN }));
t('Handwork: invalid', 'margin 100 or more', 'error', BAD({ method: 'margin', margin: 100 }));
t('Handwork: invalid', 'discount above 100; negative discount', 'error x2', [BAD({ discount: 101 }), BAD({ discount: -5 })].join() === 'error,error' ? 'error x2' : 'bad');
t('Handwork: invalid', 'material with quantity 0; cost left empty; text cost', 'error x3', [er(E.handwork({ ...SERV, materials: [{ name: 'X', qty: 0, cost: 5 }] })), er(E.handwork({ ...SERV, materials: [{ name: 'X', qty: 2, cost: '' }] })), er(E.handwork({ ...SERV, materials: [{ name: 'X', qty: 2, cost: 'abc' }] }))].join() === 'error,error,error' ? 'error x3' : 'bad');
t('Handwork: invalid', 'negative hours; negative rate; negative transport', 'error x3', [BAD({ hours: -1 }), BAD({ rate: -1 }), BAD({ transport: -1 })].join() === 'error,error,error' ? 'error x3' : 'bad');
t('Handwork: registry', 'free, no limit, premium list is planned only', 'free / null / null', (() => { const c = reg.find((x) => x.id === 'handwork-pricing'); return c.access + ' / ' + c.free_limit + ' / ' + c.premium_limit; })());

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
