// Sample card data. All series, characters and card text below are ORIGINAL
// placeholder content for demonstrating the app; they are not real Weiss Schwarz cards.
// To load real data, replace this file (or call db.importCards()) with records of the same shape.
//
// Card shape:
// { number, name, nameJp, series, set, rarity, type: 'Character'|'Event'|'Climax',
//   color, level, cost, power, soul, triggers: [], traits: [], effect: [], flavor, illustrator, image }

const card = (number, name, nameJp, series, set, rarity, type, color, level, cost, power, soul, triggers, traits, effect, flavor, illustrator) => ({
  number, name, nameJp, series, set, rarity, type, color, level, cost, power, soul,
  triggers, traits, effect, flavor, illustrator, image: null,
});

const SLA = 'Starlight Academy';
const EMK = 'Ember Knights';
const TDC = 'Tidecaller Chronicles';
const VDW = 'Verdant Wanderers';

export const CARDS = [
  // ───────── Starlight Academy (Yellow / Blue) ─────────
  card('SLA/S01-001', 'Luna, Night Watch Prefect', 'ルナ', SLA, 'SLA/S01', 'C', 'Character', 'Yellow', 0, 0, 2000, 1, [], ['Magic', 'Student'],
    ['[ACT] BACKUP 1500 Level 1 [Discard this card from your hand to the waiting room]: Choose 1 of your Characters in battle, and it gets +1500 power until end of turn.'],
    'Curfew is at nine. Stars don\'t count.', 'Studio Lumen'),
  card('SLA/S01-002', 'Orion, Rooftop Astronomer', 'オリオン', SLA, 'SLA/S01', 'C', 'Character', 'Blue', 0, 1, 3000, 1, [], ['Student', 'Science'],
    ['[AUTO] When this card is placed from your hand to the Stage, look at the top card of your deck. You may put it into the waiting room.'],
    'He charted every star but missed the bell.', 'Studio Lumen'),
  card('SLA/S01-003', 'Vega, Chalk Dust Duelist', 'ベガ', SLA, 'SLA/S01', 'U', 'Character', 'Yellow', 1, 1, 5500, 1, [], ['Student', 'Weapon'],
    ['[CONT] During your turn, if you have 2 or more other Characters, this card gets +1000 power.',
     '[AUTO] ENCORE [Discard a Character card from your hand to the waiting room]'],
    'A duel is just a lesson with higher stakes.', 'Studio Lumen'),
  card('SLA/S01-004', 'Seraphine, Headmistress of Starlight', 'セラフィーヌ', SLA, 'SLA/S01', 'SR', 'Character', 'Blue', 3, 2, 10500, 2, [], ['Magic', 'Teacher'],
    ['[CONT] During your turn, if you have 3 or more other Characters, this card gets +2000 power.',
     '[AUTO] When this card attacks, you may pay the cost [(1)]. If you do, look at the top 4 cards of your deck, choose up to 1 Climax card among them, reveal it, put it into your hand, and put the rest into the waiting room.'],
    'Every constellation answers to her.', 'Studio Aurelia'),
  card('SLA/S01-005', 'Lyra, Constellation Reader', 'リラ', SLA, 'SLA/S01', 'R', 'Character', 'Yellow', 2, 2, 8000, 1, [], ['Magic', 'Student'],
    ['[CONT] ASSIST All your Characters in front of this card get +500 power for each level of this card.',
     '[AUTO] ENCORE [(1)]'],
    'She reads the sky the way others read novels.', 'Studio Aurelia'),
  card('SLA/W01-001', 'Starlight Convocation', '星の集会', SLA, 'SLA/W01', 'U', 'Event', 'Yellow', 0, 1, null, null, [], [],
    ['Choose up to 2 Characters in your waiting room, and return them to your hand.'],
    'All students to the observatory.', 'Studio Lumen'),
  card('SLA/W01-002', 'Night of Falling Stars', '星降る夜', SLA, 'SLA/W01', 'CC', 'Climax', 'Yellow', null, null, null, null, ['Soul', 'Draw'], [],
    ['[CONT] All your Characters get +1 soul.'],
    'Make a wish before the sky runs out.', 'Studio Aurelia'),

  // ───────── Ember Knights (Red / Green) ─────────
  card('EMK/S01-001', 'Kaelen, Ember Squire', 'ケーレン', EMK, 'EMK/S01', 'C', 'Character', 'Red', 0, 0, 2500, 1, [], ['Knight', 'Fire'],
    ['[AUTO] When this card is placed from your hand to the Stage, you may discard a card from your hand to the waiting room. If you do, this card gets +1500 power until end of turn.'],
    'Every flame starts small.', 'Studio Ember'),
  card('EMK/S01-002', 'Brisa, Ash Courier', 'ブリサ', EMK, 'EMK/S01', 'C', 'Character', 'Green', 0, 0, 3000, 1, [], ['Knight', 'Messenger'],
    ['[ACT] BACKUP 500 Level 2 [Discard this card from your hand to the waiting room]: Choose 1 of your Characters in battle, and it gets +500 power until end of turn.'],
    'The message arrived. The courier arrived later.', 'Studio Ember'),
  card('EMK/S01-003', 'Dorn, Blazeforged Lancer', 'ドーン', EMK, 'EMK/S01', 'C', 'Character', 'Red', 1, 1, 6000, 1, [], ['Knight', 'Weapon'],
    ['[AUTO] When this card attacks, if there is a Climax card in your Climax zone, this card gets +2000 power until end of turn.',
     '[AUTO] ENCORE [Discard a card from your hand to the waiting room]'],
    'His lance is still warm from the forge.', 'Studio Ember'),
  card('EMK/S01-004', 'Ysolde, Cinderqueen', 'イゾルデ', EMK, 'EMK/S01', 'SR', 'Character', 'Red', 3, 2, 9500, 2, [], ['Knight', 'Fire'],
    ['[CONT] During your turn, all your other Characters with "Fire" get +1000 power.',
     '[AUTO] When the Character that battled this card is reversed, you may pay the cost [(2)]. If you do, deal 1 damage to your opponent.'],
    'Kneel, and the ashes will remember you kindly.', 'Studio Aurelia'),
  card('EMK/S01-005', 'Marguerite, Pyre Alchemist', 'マルグリット', EMK, 'EMK/S01', 'R', 'Character', 'Green', 2, 2, 7500, 1, [], ['Alchemist', 'Fire'],
    ['[AUTO] When this card is placed from your hand to the Stage, look at up to the top 3 cards of your deck, choose up to 1 Character with "Fire" among them, reveal it, put it into your hand, and put the rest into the waiting room.',
     '[AUTO] ENCORE [(1)]'],
    'Gold is easy. Fire is the hard part.', 'Studio Ember'),
  card('EMK/S01-006', 'Forge Oath', '鍛冶の誓い', EMK, 'EMK/S01', 'U', 'Event', 'Red', 1, 2, null, null, [], [],
    ['Choose up to 1 of your Characters. It gets +3000 power and +1 soul until end of turn.'],
    'Sworn in sparks, kept in steel.', 'Studio Ember'),
  card('EMK/S01-007', 'Crimson Siege', '紅蓮の攻城', EMK, 'EMK/S01', 'CC', 'Climax', 'Red', null, null, null, null, ['Soul', 'Soul'], [],
    ['[CONT] All your Characters get +1000 power and +1 soul.'],
    'The walls were never the problem.', 'Studio Ember'),

  // ───────── Tidecaller Chronicles (Blue / Green) ─────────
  card('TDC/S01-001', 'Nerei, Tide Apprentice', 'ネレイ', TDC, 'TDC/S01', 'C', 'Character', 'Blue', 0, 0, 2000, 1, [], ['Water', 'Mage'],
    ['[AUTO] When this card is placed from your hand to the Stage, you may draw 1 card, then discard 1 card from your hand to the waiting room.'],
    'The sea teaches patience, mostly by drowning impatience.', 'Studio Tide'),
  card('TDC/S01-002', 'Piko, Reef Scout', 'ピコ', TDC, 'TDC/S01', 'C', 'Character', 'Green', 0, 0, 3000, 1, [], ['Water', 'Animal'],
    ['[ACT] BACKUP 1000 Level 1 [Discard this card from your hand to the waiting room]: Choose 1 of your Characters in battle, and it gets +1000 power until end of turn.'],
    'Small fins, big opinions.', 'Studio Tide'),
  card('TDC/S01-003', 'Coralyn, Pearl Diver', 'コーラリン', TDC, 'TDC/S01', 'U', 'Character', 'Blue', 1, 0, 5000, 1, [], ['Water', 'Mage'],
    ['[AUTO] When this card attacks, look at the top card of your deck. You may put it into the waiting room.',
     '[AUTO] ENCORE [(1)]'],
    'She never surfaces empty-handed.', 'Studio Tide'),
  card('TDC/S01-004', 'Captain Marek Ironkeel', 'マレク', TDC, 'TDC/S01', 'R', 'Character', 'Green', 2, 1, 8500, 1, [], ['Pirate', 'Weapon'],
    ['[CONT] During your turn, this card gets +500 power for each other Character with "Pirate" you have.',
     '[AUTO] ENCORE [Discard a Character card from your hand to the waiting room]'],
    'The tide takes everything. He takes it back.', 'Studio Tide'),
  card('TDC/S01-005', 'Thalassa, Tidecaller', 'タラッサ', TDC, 'TDC/S01', 'SR', 'Character', 'Blue', 3, 2, 9000, 2, [], ['Water', 'Mage'],
    ['[ACT] BRAINSTORM [(1) Rest this card]: Reveal the top 4 cards of your deck and put them into the waiting room. For each Climax card revealed, choose up to 1 Character in your waiting room and return it to your hand.'],
    'When she calls, even the moon turns its head.', 'Studio Aurelia'),
  card('TDC/S01-006', 'Undertow', '引き潮', TDC, 'TDC/S01', 'U', 'Event', 'Blue', 0, 1, null, null, [], [],
    ['Choose 1 of your opponent\'s Characters with level 1 or lower, and return it to their hand.'],
    'Gone before it knew it was moving.', 'Studio Tide'),
  card('TDC/S01-007', 'Maelstrom Tide', '大渦潮', TDC, 'TDC/S01', 'CC', 'Climax', 'Blue', null, null, null, null, ['Draw', 'Pool'], [],
    ['[CONT] All your Characters get +2000 power.'],
    'Hold your breath. Hold your ground.', 'Studio Tide'),

  // ───────── Verdant Wanderers (Green / Yellow) ─────────
  card('VDW/S01-001', 'Willow, Moss Tender', 'ウィロウ', VDW, 'VDW/S01', 'C', 'Character', 'Green', 0, 0, 2500, 1, [], ['Nature', 'Healer'],
    ['[AUTO] When this card is placed from your hand to the Stage, you may choose 1 Climax card in your waiting room and return it to your hand.'],
    'Everything grows back, given time and tea.', 'Studio Verde'),
  card('VDW/S01-002', 'Fenwick, Trail Cook', 'フェンウィック', VDW, 'VDW/S01', 'C', 'Character', 'Yellow', 0, 0, 3500, 1, [], ['Nature', 'Chef'],
    ['[ACT] BACKUP 1000 Level 2 [Discard this card from your hand to the waiting room]: Choose 1 of your Characters in battle, and it gets +1000 power until end of turn.'],
    'Soup solves most problems on the road.', 'Studio Verde'),
  card('VDW/S01-003', 'Hazel, Hedge Witch', 'ヘイゼル', VDW, 'VDW/S01', 'U', 'Character', 'Green', 1, 1, 5500, 1, [], ['Nature', 'Magic'],
    ['[AUTO] When this card attacks, you may pay the cost [(1)]. If you do, look at the top card of your deck, and put it on top of your deck or into the waiting room.'],
    'The hedge knows who is coming before you do.', 'Studio Verde'),
  card('VDW/S01-004', 'Brann, Wandering Smith', 'ブラン', VDW, 'VDW/S01', 'R', 'Character', 'Yellow', 2, 2, 8000, 1, [], ['Nature', 'Artisan'],
    ['[AUTO] When this card is placed from your hand to the Stage, you may pay the cost [(1)]. If you do, search your deck for up to 1 Character with "Nature", reveal it, put it into your hand, and shuffle your deck.'],
    'He mends the road as he walks it.', 'Studio Verde'),
  card('VDW/S01-005', 'Elder Oakheart, the Last Grove', 'オークハート', VDW, 'VDW/S01', 'RR', 'Character', 'Green', 3, 2, 10000, 2, [], ['Nature', 'Spirit'],
    ['[CONT] During your turn, all your other Characters with "Nature" get +500 power.',
     '[AUTO] When this card is placed from your hand to the Stage, you may pay the cost [(1)]. If you do, choose 1 card in your clock and put it into the waiting room.'],
    'Roots remember what leaves forget.', 'Studio Aurelia'),
  card('VDW/S01-006', 'Wayfarer\'s Rest', '旅人の休息', VDW, 'VDW/S01', 'U', 'Event', 'Green', 0, 1, null, null, [], [],
    ['Choose up to 1 Character with "Nature" in your waiting room, and return it to your hand. Then, you may put the top card of your clock into the waiting room.'],
    'A fire, a roof, and no questions.', 'Studio Verde'),
  card('VDW/S01-007', 'Verdant Bloom', '緑の開花', VDW, 'VDW/S01', 'CC', 'Climax', 'Green', null, null, null, null, ['Soul', 'Pool'], [],
    ['[CONT] All your Characters get +1000 power.'],
    'Spring does not ask permission.', 'Studio Verde'),
];
