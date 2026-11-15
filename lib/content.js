'use strict';
/* All the game content: board layout, card decks, rules and questions. Edit freely! */

// ---- The board: Start + 49 houses + Finish, in four stages ----
const T = (type, n) => ({ type, n: n || 0 });
const BOARD = [
  T('start'),
  // Stage 1
  T('sip', 1), T('card'), T('ohno'), T('give', 2), T('meeting'), T('fwd', 2), T('vote'), T('sip', 1), T('rps'), T('ohno'), T('card'), T('all', 1),
  // Stage 2
  T('meeting'), T('duel'), T('back', 3), T('number'), T('ohno'), T('sip', 2), T('rule'), T('reflex'), T('trust'), T('meeting'), T('water'), T('give', 2), T('ohno'),
  // Stage 3
  T('card'), T('dicedrink'), T('fwd', 3), T('mystery'), T('sip', 2), T('meeting'), T('least'), T('ohno'), T('rps'), T('vote'), T('back', 4), T('rule'), T('card'),
  // Stage 4
  T('ohno'), T('duel'), T('meeting'), T('give', 3), T('number'), T('all', 1), T('sip', 3), T('reflex'), T('ohno'), T('trust'), T('meeting'),
  T('finish'),
];
// One name per row of the board, after Giant bike families
const STAGES = ['STAGE 1 · PROPEL ROAD', 'STAGE 2 · REVOLT GRAVEL', 'STAGE 3 · TRANCE TRAIL', 'STAGE 4 · REIGN DESCENT'];
// The eight riders you can pick, named after Giant bikes
const BIKES = ['TCR', 'Propel', 'Defy', 'Revolt', 'Trance', 'Reign', 'Glory', 'Talon'];

const TILE_INFO = {
  start: { name: 'Start', desc: 'Everybody starts here.' },
  sip: { name: 'Bidon', desc: 'Drink the number of sips shown.' },
  give: { name: 'Hand-up', desc: 'Secretly hand out sips to other riders.' },
  card: { name: 'Secret Card', desc: 'Draw a secret card. Only you can see it.' },
  meeting: { name: 'Emergency Meeting', desc: 'Draw an Emergency Meeting card and do what it says.' },
  ohno: { name: 'Oh No!', desc: 'Draw an Oh No card. You got caught.' },
  vote: { name: 'Secret Vote', desc: 'Everyone votes in secret. Most votes drinks.' },
  trust: { name: 'Breakaway', desc: 'Two riders choose in secret: ride together or attack.' },
  duel: { name: 'Sprint Duel', desc: 'Challenge someone. Lowest roll drinks.' },
  number: { name: 'Which Gear?', desc: 'Guess the secret gear.' },
  all: { name: 'Peloton', desc: 'Everybody drinks.' },
  fwd: { name: 'Propel', desc: 'Aero boost: jump forward.' },
  back: { name: 'Puncture', desc: 'Flat tyre: slide back.' },
  water: { name: 'Feed Zone', desc: 'Everyone takes a sip of water.' },
  rule: { name: 'Make a Rule', desc: 'Pick a rule or write your own. It applies to everyone, you included.' },
  dicedrink: { name: 'Roll and Sip', desc: 'Roll the dice and drink that many sips.' },
  mystery: { name: 'Pick a Card', desc: 'Three face-down cards: drink, make someone drink, or roll again.' },
  reflex: { name: 'Bell Lap', desc: 'A button appears on every phone. Last to tap it drinks.' },
  rps: { name: 'Rock Paper Scissors', desc: 'Pick a rival. Loser drinks, a draw means both drink.' },
  least: { name: 'Lanterne Rouge', desc: 'Whoever has the fewest sips so far drinks 2.' },
  push: { name: 'Lead-out', desc: '' },
  pair: { name: 'Celebrate', desc: '' },
  deck: { name: 'Card', desc: '' },
  joke: { name: 'Tell a joke', desc: '' },
  finish: { name: 'Finish', desc: 'First one here wins!' },
};

// ---- Rules a player can switch on from a "Make a Rule" house or card. They apply to everybody. ----
const RULES = {
  one: { name: 'Reverse Gear', text: 'Roll a 1 and you move 1 house backwards.' },
  six3: { name: 'Triple Six', text: 'Roll a 6 three times in a row and you go back 12 houses.' },
  poll: { name: 'Round Poll', text: 'After every full round, everyone votes on who drinks a sip.' },
  three: { name: 'Lead-out', text: 'Roll a 3 and you stay put: pick another rider to move 3 houses forward.' },
  five: { name: 'High Five', text: 'Roll a 5 and you drink a sip.' },
  draft: { name: 'Slipstream', text: 'Stop on a house where someone already is, and you both drink a sip.' },
  chain: { name: 'Chain Gang', text: 'Roll the same number as the rider before you, and you both drink a sip.' },
  yellow: { name: 'Yellow Jersey', text: 'At the start of every round, the rider in front drinks a sip.' },
  tail: { name: 'Tailwind', text: 'Roll a 6 and everybody else drinks a sip.' },
  broom: { name: 'Broom Wagon', text: 'At the start of every round, the rider in last place moves 2 houses forward.' },
};

// ---- Secret cards ----
// when: 'react' = play when sips land on you, 'turn' = play on your turn before rolling, 'auto' = plays itself
const CARDS = {
  shield: { name: 'Maestro Suspension', when: 'react', weight: 5, desc: 'Soaks up the hit: block every sip aimed at you.' },
  mirror: { name: 'U-Turn', when: 'react', weight: 3, desc: 'Send the sips straight back to the rider who gave them.' },
  potato: { name: 'Pass the Bidon', when: 'react', target: true, weight: 4, desc: 'Pass your sips to any rider you choose.' },
  half: { name: 'D-Fuse', when: 'react', weight: 4, desc: 'Damps the hit: your sips are cut in half (rounded down).' },
  loaded: { name: 'E+ Boost', when: 'turn', weight: 3, desc: 'Skip the roll and pick your own number, 1 to 6.' },
  swap: { name: 'Bike Swap', when: 'turn', target: true, weight: 2, desc: 'Swap board positions with any rider, then roll.' },
  thief: { name: 'Bike Thief', when: 'turn', target: true, weight: 3, desc: 'Steal a random card from another rider.' },
  double: { name: 'OverDrive', when: 'turn', weight: 3, desc: 'The next sips you hand out are doubled.' },
  skip: { name: 'Skip the Cantine', when: 'auto', weight: 0, desc: 'Not enough workers! When you are sent to the Cantine, this card plays itself and you keep riding.' },
};

// ---- Emergency Meeting deck (adapted from the printed cards: money became sips, cards and moves) ----
// fx.k: others | all | self | pair | rule | give | move | keep | joke | vote | roll
const MEETINGS = [
  { art: 'em-1', text: 'We did very bad last week...', effect: 'Everybody drinks... except you!', fx: { k: 'others', n: 1 } },
  { art: 'em-2', text: '...You reach the target!', effect: 'Bonus: draw a secret card. Drink to celebrate with one more colleague.', fx: { k: 'pair', n: 1, card: 1 } },
  { art: 'em-3', text: 'You need to make a new rule that will last until the end of the game...', effect: 'Be wise!', fx: { k: 'rule' }, copies: 5 },
  { art: 'em-4', text: 'You make overtime all week...', effect: 'Overtime pays off: hand out 2 sips.', fx: { k: 'give', n: 2 } },
  { art: 'em-6', text: 'Kaizen approved!', effect: 'Move 3 houses forward.', fx: { k: 'move', n: 3 } },
  { art: 'em-8', text: 'You got promoted to the bosses of the bosses!', effect: 'Draw a secret card and drink to celebrate with all colleagues!', fx: { k: 'all', n: 1, card: 1 } },
  { art: 'em-9', text: 'Not enough workers. You\'re free to skip the Cantine!', effect: 'Keep this card. It saves you the next time you are sent to the Cantine.', fx: { k: 'keep', card: 'skip' }, copies: 2 },
  { art: 'em-10', text: 'Team building partyyyyyyyy!', effect: 'Drink with all colleagues!', fx: { k: 'all', n: 2 } },
  { art: 'em-11', text: 'Very boring meeting... tell a joke.', effect: 'If no one laughs, you drink. Who laughs, drinks.', fx: { k: 'joke' } },
  { art: 'em-12', text: 'In this meeting, we will decide who will drink... start voting!', effect: 'More votes drink!', fx: { k: 'vote' } },
  { art: 'em-14', text: 'One sip for every two tools you break!', effect: 'Roll your dice to see how many tools you break.', fx: { k: 'roll', half: true } },
  { art: 'em-16', text: 'You have won employee of the month!', effect: 'Bonus: draw a secret card. Drink to celebrate!', fx: { k: 'self', n: 1, card: 1 } },
  { art: 'em-18', text: 'We did very well this year! Thanks to your hard work!', effect: 'Bonus: roll again after this. Drink to celebrate with one more colleague.', fx: { k: 'pair', n: 1, again: true } },
];

// ---- Oh No deck ----
// self extras: lose (hand in a card), back (houses), cantine (miss a turn in the Cantine), out (miss a turn)
const OHNOS = [
  { art: 'on-1', text: '...You lost your tag!!', effect: 'Drink, and hand in one secret card.', fx: { k: 'self', n: 1, lose: true } },
  { art: 'on-2', text: '...You finish work, going home and security check your backpack. He find extra bananas!', effect: 'Roll your dice to see how many bananas you got and drink that amount of sips.', fx: { k: 'roll' } },
  { art: 'on-3', text: '...They catch you using a hammer to insert a small rubber in a bicycle...', effect: 'Drink', fx: { k: 'self', n: 2 } },
  { art: 'on-4', text: 'They catch you sleeping behind the boxes!', effect: 'Drink and go directly to the Cantine.', fx: { k: 'self', n: 1, cantine: true } },
  { art: 'on-5', text: '...You fail to pass Rob\'s training...', effect: 'Drink to forget', fx: { k: 'self', n: 3 } },
  { art: 'on-6', text: '...No safety shoes again???', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-7', text: 'You break a very expensive Inbus 5...', effect: 'Drink', fx: { k: 'self', n: 2 } },
  { art: 'on-8', text: '...They just caught you on the phone watching videos...', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-9', text: '... QC caught you using blue bins instead of red bins?!', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-10', text: '...You checked in 0,0000000001 sec late!', effect: 'Tempo Team come speak with you and send you to the Cantine. Also drink.', fx: { k: 'self', n: 1, cantine: true } },
  { art: 'on-11', text: '...They catch you using headphones...', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-12', text: '...Why you forgot to fill TPM again???', effect: 'Drink, and roll back 2 houses.', fx: { k: 'self', n: 1, back: 2 } },
  { art: 'on-13', text: '... You just make a 1 hour line stop!', effect: 'Go to the Cantine! And drink 2 while everybody waits.', fx: { k: 'self', n: 2, cantine: true } },
  { art: 'on-14', text: '...They catch you sharpening your knives on wheelbuilding!', effect: 'Roll your dice to see how many knives you got and drink that amount of sips.', fx: { k: 'roll' } },
  { art: 'on-15', text: '... You fell off the bike and broke your elbow...', effect: 'Sick leave: you miss your next turn. And drink... of course!', fx: { k: 'self', n: 1, out: true } },
  { art: 'on-16', text: '...Again forgot to tie up your hair??', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-17', text: 'Why didn\'t you go to the meeting?', effect: 'Drink', fx: { k: 'self', n: 1 } },
  { art: 'on-18', text: '...You forget your PDMS password...', effect: 'Drink', fx: { k: 'self', n: 1 } },
];
const expand = (list) => list.reduce((a, c) => a.concat(Array.from({ length: c.copies || 1 }, () => c)), []);

const VOTES = [
  'Who is most likely to show up to work in full lycra?',
  'Who would get lost on a straight bike path?',
  'Who is most likely to fall over at a red light, still clipped in?',
  'Who would walk their bike up the smallest hill?',
  'Who is most likely to fall asleep first tonight?',
  'Who takes the longest coffee breaks?',
  'Who is most likely to cause a line stop tomorrow?',
  'Who has the worst taste in music?',
  'Who would be the worst roommate?',
  'Who is most likely to forget to lock their bike?',
  'Who is always late?',
  'Who is most likely to laugh at the wrong moment in a meeting?',
  'Who would spend lottery winnings the fastest?',
  'Who gives the worst advice?',
  'Who is most likely to buy a bike that costs more than their car?',
  'Who would win in an argument, even when wrong?',
  'Who is most likely to start dancing on a table?',
  'Who would lose their phone on a night out?',
  'Who sings the loudest at karaoke?',
  'Who is the pickiest eater in the cantine?',
  'Who is most likely to take the e-bike and call it training?',
  'Who would be first to quit on a camping trip?',
  'Who is most likely to become the boss of the bosses?',
  'Who is most likely to go viral for something embarrassing?',
];

module.exports = { BOARD, STAGES, BIKES, TILE_INFO, CARDS, RULES, VOTES, MEETINGS: expand(MEETINGS), OHNOS: expand(OHNOS) };
