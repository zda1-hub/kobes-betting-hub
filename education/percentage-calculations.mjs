/** Two non-overlapping groups using the same shot definition. */
export function combinePercentages(records) {
  const groups=records.map((record,index)=>{
    const parsed={};
    for(const field of ['made','attempted']){
      const text=String(record[field]??'').trim();
      if(text.length>16||!/^\d+$/.test(text)||Number(text)>1_000_000)
        throw Object.assign(new Error('Use whole counts from 0 to 1,000,000, without commas, signs or units.'),{index,field});
      parsed[field]=Number(text);
    }
    if(parsed.made>parsed.attempted)throw Object.assign(new Error('Makes cannot exceed attempts.'),{index,field:'made'});
    return {...parsed,rate:parsed.attempted?parsed.made/parsed.attempted*100:null};
  });
  if(groups.length!==2)throw new Error('Enter exactly two groups.');
  const made=groups.reduce((sum,g)=>sum+g.made,0),attempted=groups.reduce((sum,g)=>sum+g.attempted,0);
  return {groups,made,attempted,combined:attempted?made/attempted*100:null,mean:groups.every(g=>g.rate!==null)?(groups[0].rate+groups[1].rate)/2:null};
}
