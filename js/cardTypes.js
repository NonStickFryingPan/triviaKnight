'use strict';

const CardTypes = (function () {
  const TYPES = ['flashcard', 'mcq', 'fill_blank'];

  // last render's shuffled options per card, so grade() maps the UI index back
  const lastShuffle = new WeakMap();

  function render(card) {
    switch (card.type) {
      case 'flashcard':
        return { front: card.front, back: card.back };

      case 'mcq': {
        const order = Tk.shuffle(card.options.map((_, i) => i));
        lastShuffle.set(card, order);
        return { question: card.question, options: order.map((i) => card.options[i]) };
      }

      case 'fill_blank':
        return { sentence: card.sentence };

      default:
        throw new Error('Unknown card type: ' + card.type);
    }
  }

  function grade(card, userResponse) {
    switch (card.type) {
      case 'flashcard': {
        const q = Math.max(0, Math.min(5, Math.round(userResponse)));
        return { correct: q >= 3, quality: q };
      }

      case 'mcq': {
        const order = lastShuffle.get(card) || card.options.map((_, i) => i);
        const actual = order[userResponse];
        const correct = actual === card.correctIndex;
        return { correct, quality: correct ? 4 : 0 };
      }

      case 'fill_blank': {
        const correct = Tk.fuzzyMatch(userResponse, card.answer);
        return { correct, quality: correct ? 4 : 0 };
      }

      default:
        throw new Error('Unknown card type: ' + card.type);
    }
  }

  // returns the correct answer as displayable text (used after an answer is revealed)
  function reveal(card) {
    switch (card.type) {
      case 'flashcard':
        return card.back;
      case 'mcq':
        return card.options[card.correctIndex] || '';
      case 'fill_blank':
        return card.answer;
      default:
        return '';
    }
  }

  function typeLabel(type) {
    return { flashcard: 'Flashcard', mcq: 'Multiple Choice', fill_blank: 'Fill in the Blank' }[type] || type;
  }

  return { TYPES, render, grade, reveal, typeLabel };
})();

if (typeof globalThis !== 'undefined') globalThis.CardTypes = CardTypes;