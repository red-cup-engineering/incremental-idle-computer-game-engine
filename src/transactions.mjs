/** Pure engine-owned material debit. No clock advancement or action credit.
 * Call advance separately when elapsed production is intended. Amount uses the
 * engine's bounded integer point unit, not real money or fractional quantities.
 */
import {boundedNatural} from '@red-cup-engineering/computer-data-engineering-services-section/simulation/discrete-clock';
import {admitRun,MAX_POINTS} from './engine.mjs';
export function spendPoints(world,candidate,amount){
 boundedNatural(amount,'amount',MAX_POINTS);
 const state=admitRun(world,candidate);
 if(amount>state.banked)return {accepted:false,reason:'insufficient-points',spent:0,state};
 return {accepted:true,spent:amount,state:{...state,banked:state.banked-amount}};
}
