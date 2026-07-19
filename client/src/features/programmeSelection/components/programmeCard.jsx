// src/components/ProgrammeCard.jsx
import React from 'react';
import Button from './Button';

const ProgrammeCard = ({ tag, title, description, image, onOpen }) => (
  <article className="programme-card">
    <div className="programme-card-banner">
      <img src={image} alt="" className="programme-card-image" />
      <span className="programme-card-tag">{tag}</span>
    </div>

    <div className="programme-card-body">
      <h3 className="programme-card-title">{title}</h3>
      <p className="programme-card-description">{description}</p>

      <div className="programme-card-actions">
       
        <Button variant="primary" icon="arrow-right" onClick={onOpen}>
          Open
        </Button>
      </div>
    </div>
  </article>
);

export default ProgrammeCard;