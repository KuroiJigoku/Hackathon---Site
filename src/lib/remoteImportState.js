let last = { imported: 0, absents: 0, at: null, source: null };

export function setLast(info){
  last = { ...last, ...info };
}

export function getLast(){ return last; }
