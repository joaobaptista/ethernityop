import React, { useState, useEffect } from 'react';
import './SpecialPersonFormCard.css';

/**
 * SpecialPersonFormCard — Step 2.5: Identificação e detalhes da pessoa especial
 * Exatamente como o mockup do usuário:
 * • Topo: Voltar para Pessoas Identificadas e Contador "Pessoa X de Y"
 * • Centro: Avatar recortado por IA com badge "X fotos juntos"
 * • Título: "Quem é essa pessoa especial?"
 * • Aviso seguro com escudo sobre privacidade futura
 * • Campos: Nome Completo (mandatório), Relação (mandatória), Telefone (opcional), E-mail (opcional)
 * • Rodapé: "Pular esta pessoa" e "Próxima Pessoa →" (desabilitado se nome ou relação vazios)
 */
export default function SpecialPersonFormCard({
  person,
  personIndex = 0,
  totalPersons = 1,
  onBack,
  onSaveAndNext,
  onSkip,
}) {
  const [name, setName] = useState(person?.name || '');
  const [relationship, setRelationship] = useState(person?.relationship || 'Filha');
  const [phone, setPhone] = useState(person?.phone || '');
  const [email, setEmail] = useState(person?.email || '');

  // Atualiza estado local quando a pessoa ativa mudar
  useEffect(() => {
    if (person) {
      setName(person.name && !person.name.startsWith('Pessoa ') ? person.name : '');
      setRelationship(person.relationship || 'Filha');
      setPhone(person.phone || '');
      setEmail(person.email || '');
    }
  }, [person, personIndex]);

  const isFormValid = name.trim().length > 0 && relationship.trim().length > 0;
  const isLast = personIndex >= totalPersons - 1;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    onSaveAndNext({
      name: name.trim(),
      relationship: relationship.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  };

  const photoCountLabel = person?.totalCount
    ? `${person.totalCount} fotos juntos`
    : person?.photosCount
    ? person.photosCount.includes('juntos')
      ? person.photosCount
      : `${person.photosCount} juntos`
    : '1 foto juntos';

  return (
    <div className="special-person-wrapper fade-in">
      {/* Barra Superior de Navegação */}
      <div className="special-person-topbar">
        <button
          type="button"
          className="btn-back-to-people"
          onClick={onBack}
        >
          <i className="fa-solid fa-arrow-left"></i>
          <span>Voltar para Pessoas Identificadas</span>
        </button>

        <span className="person-counter-badge">
          Pessoa {personIndex + 1} de {totalPersons}
        </span>
      </div>

      {/* Card Central Idêntico ao Mockup */}
      <div className="special-person-card">
        {/* Topo com Avatar Central Recortado e Badge de Fotos */}
        <div className="modal-person-top">
          <div className="modal-avatar-wrapper">
            <img
              src={person?.avatar}
              alt={name || 'Pessoa Especial'}
              className="modal-avatar-image"
            />
          </div>
          <div className="modal-photos-badge">
            <span>{photoCountLabel}</span>
          </div>
        </div>

        {/* Título e Subtítulo */}
        <div className="modal-person-heading">
          <h2 className="modal-person-title">Quem é essa pessoa especial?</h2>
          <p className="modal-person-subtitle">
            Dê um nome a este rosto e adicione os dados de contato. Essas informações serão usadas no futuro, quando você decidir enviar seu presente para esta pessoa.
          </p>
        </div>

        {/* Aviso de Privacidade */}
        <div className="modal-future-notice">
          <div className="notice-icon">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <p className="notice-text">
            Esses dados são apenas para o futuro. Nada será enviado agora. Você terá total controle sobre quando e como compartilhar suas cápsulas.
          </p>
        </div>

        {/* Formulário de Dados */}
        <form onSubmit={handleSubmit} className="modal-person-form">
          {/* Nome Completo (Mandatório) */}
          <div className="person-form-field">
            <label className="person-label">
              Nome completo <span className="required-star">*</span>
            </label>
            <input
              type="text"
              required
              className="person-input"
              placeholder="ex: Mariana Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Relação (Mandatória) */}
          <div className="person-form-field">
            <label className="person-label">
              Relação <span className="required-star">*</span>
            </label>
            <div className="person-select-wrapper active-relation">
              <i className="fa-regular fa-heart relation-heart-icon"></i>
              <select
                className="person-select"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                required
              >
                <option value="Filha">Filha</option>
                <option value="Filho">Filho</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Mãe">Mãe</option>
                <option value="Pai">Pai</option>
                <option value="Irmã">Irmã</option>
                <option value="Irmão">Irmão</option>
                <option value="Amigo(a)">Amigo(a) Próximo(a)</option>
                <option value="Genro">Genro</option>
                <option value="Nora">Nora</option>
                <option value="Neto(a)">Neto(a)</option>
                <option value="Sobrinho(a)">Sobrinho(a)</option>
                <option value="Outro">Outro</option>
              </select>
              <i className="fa-solid fa-chevron-down relation-chevron-icon"></i>
            </div>
          </div>

          {/* Telefone (Opcional - não mandatório) */}
          <div className="person-form-field">
            <label className="person-label">
              Telefone <span className="optional-tag">(opcional)</span>
            </label>
            <div className="person-input-with-icon">
              <i className="fa-solid fa-phone input-icon"></i>
              <input
                type="tel"
                className="person-input icon-padded"
                placeholder="+55 (00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* E-mail (Opcional - não mandatório) */}
          <div className="person-form-field">
            <label className="person-label">
              E-mail <span className="optional-tag">(opcional)</span>
            </label>
            <div className="person-input-with-icon">
              <i className="fa-regular fa-envelope input-icon"></i>
              <input
                type="email"
                className="person-input icon-padded"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Rodapé com Pular e Próxima Pessoa */}
          <div className="modal-person-footer">
            <button
              type="button"
              className="btn-skip-person"
              onClick={onSkip}
            >
              Pular esta pessoa
            </button>

            <button
              type="submit"
              className="btn-next-person"
              disabled={!isFormValid}
              title={!isFormValid ? 'Preencha o nome e a relação para avançar' : ''}
            >
              <span>{isLast ? 'Concluir e Criar Cápsula' : 'Próxima Pessoa'}</span>
              <i className="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
