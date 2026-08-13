import { useState } from 'react';
import { CATEGORY_OPTIONS, JLPT_VALUES, GRADE_VALUES } from '../constants/categories';
import Modal from './Modal';

export default function CreateDeckModal({ onSave, onClose, existingDeck }) {
  const [name, setName] = useState(existingDeck?.name || '');
  const [description, setDescription] = useState(existingDeck?.description || '');
  const [categoryType, setCategoryType] = useState(existingDeck?.category?.type || 'custom');
  const [categoryValue, setCategoryValue] = useState(existingDeck?.category?.value || '');

  // Switching category type clears the value — a JLPT level and a custom label
  // aren't interchangeable. In the handler rather than an effect, so editing an
  // existing deck keeps its prefilled value.
  const handleCategoryTypeChange = (type) => {
    setCategoryType(type);
    setCategoryValue('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      category: { type: categoryType, value: categoryValue },
    });
  };

  const renderValueInput = () => {
    if (categoryType === 'jlpt') {
      return (
        <select
          className="form-select"
          value={categoryValue}
          onChange={e => setCategoryValue(e.target.value)}
        >
          <option value="">Select level...</option>
          {JLPT_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    if (categoryType === 'grade') {
      return (
        <select
          className="form-select"
          value={categoryValue}
          onChange={e => setCategoryValue(e.target.value)}
        >
          <option value="">Select grade...</option>
          {GRADE_VALUES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    }
    return (
      <input
        className="form-control"
        type="text"
        placeholder={categoryType === 'theme' ? 'e.g. Nature, Animals, Food...' : 'Label (optional)'}
        value={categoryValue}
        onChange={e => setCategoryValue(e.target.value)}
      />
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-header border-0">
        <h5 className="modal-title fw-bold">
          {existingDeck ? 'Edit Deck' : 'Create New Deck'}
        </h5>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
      </div>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="mb-3">
            <label className="form-label fw-semibold">Deck Name *</label>
            <input
              className="form-control"
              type="text"
              placeholder="e.g. JLPT N5 Kanji"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">Description</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Optional description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <div className="mb-3">
            <label className="form-label fw-semibold">Category Type</label>
            <div className="d-flex gap-2 flex-wrap">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`btn btn-sm touch-target ${categoryType === opt.value ? 'btn-dark' : 'btn-outline-secondary'}`}
                  onClick={() => handleCategoryTypeChange(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-1">
            <label className="form-label fw-semibold">
              {categoryType === 'custom' ? 'Label' : `${CATEGORY_OPTIONS.find(o => o.value === categoryType)?.label}`}
            </label>
            {renderValueInput()}
          </div>
        </div>
        <div className="modal-footer border-0">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-dark" disabled={!name.trim()}>
            {existingDeck ? 'Save Changes' : 'Create Deck'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
