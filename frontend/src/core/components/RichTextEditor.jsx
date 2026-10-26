import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import './RichTextEditor.css';

/**
 * RichTextEditor — Editor de Texto Rico Humanizado para o Ethernity DMs
 * Permite compor cartas, mensagens e memórias com formatação rica,
 * visual acolhedor, contagem de palavras e indicador de auto-salve.
 */
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Escreva aqui suas palavras mais carinhosas e importantes. Suas histórias e sentimentos serão preservados com segurança.',
  minHeight = '200px',
  disabled = false,
  saveStatus = 'saved', // 'saved' | 'saving' | 'unsaved'
  lastSavedAt = null,
  id = 'rich-text-editor',
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (onChange) {
        // Normaliza editor vazio para string limpa
        const isEmpty =
          editor.isEmpty ||
          html === '<p></p>' ||
          html === '<p><br></p>';
        onChange(isEmpty ? '' : html);
      }
    },
  });

  // Sincronização externa (ex: sugestão da IA ou restauração de rascunho)
  useEffect(() => {
    if (!editor) return;

    const currentHtml = editor.getHTML();
    const normalizedProp = value || '';

    // Se o valor externo for diferente e não estiver em digitação idêntica
    if (normalizedProp !== currentHtml) {
      if (!normalizedProp || normalizedProp === '<p></p>') {
        if (!editor.isEmpty) {
          editor.commands.setContent('', false);
        }
      } else {
        editor.commands.setContent(normalizedProp, false);
      }
    }
  }, [value, editor]);

  // Atualiza estado editável se a prop disabled mudar
  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  if (!editor) {
    return null;
  }

  // Contagem de palavras e caracteres
  const text = editor.state.doc.textContent || '';
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const charCount = text.length;

  // Formatação amigável do horário do último salvamento
  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className={`rte-container ${disabled ? 'rte-disabled' : ''}`} id={id}>
      {/* 1. BARRA DE FERRAMENTAS SUPERIOR (TOOLBAR) */}
      <div className="rte-toolbar" role="toolbar" aria-label="Ferramentas de formatação de texto">
        {/* Grupo 1: Estilo de Fonte Básica */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Negrito (Ctrl+B)"
            aria-label="Negrito"
          >
            <i className="fa-solid fa-bold"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Itálico (Ctrl+I)"
            aria-label="Itálico"
          >
            <i className="fa-solid fa-italic"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Sublinhado (Ctrl+U)"
            aria-label="Sublinhado"
          >
            <i className="fa-solid fa-underline"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('strike') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Tachado"
            aria-label="Tachado"
          >
            <i className="fa-solid fa-strikethrough"></i>
          </button>
        </div>

        <div className="rte-divider"></div>

        {/* Grupo 2: Estrutura & Citações */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Subtítulo Principal (H2)"
            aria-label="Subtítulo Principal"
          >
            <span className="rte-btn-label">H2</span>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Seção / Título Menor (H3)"
            aria-label="Seção Menor"
          >
            <span className="rte-btn-label">H3</span>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('blockquote') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Citação em Destaque"
            aria-label="Citação em Destaque"
          >
            <i className="fa-solid fa-quote-left"></i>
          </button>
        </div>

        <div className="rte-divider"></div>

        {/* Grupo 3: Listas */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${editor.isActive('bulletList') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Lista com Marcadores"
            aria-label="Lista com Marcadores"
          >
            <i className="fa-solid fa-list-ul"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('orderedList') ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Lista Numerada"
            aria-label="Lista Numerada"
          >
            <i className="fa-solid fa-list-ol"></i>
          </button>
        </div>

        <div className="rte-divider"></div>

        {/* Grupo 4: Alinhamento */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className={`rte-btn ${editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Alinhar à Esquerda"
            aria-label="Alinhar à Esquerda"
          >
            <i className="fa-solid fa-align-left"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Centralizar"
            aria-label="Centralizar"
          >
            <i className="fa-solid fa-align-center"></i>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Alinhar à Direita (Dedicatórias)"
            aria-label="Alinhar à Direita"
          >
            <i className="fa-solid fa-align-right"></i>
          </button>
        </div>

        <div className="rte-divider"></div>

        {/* Grupo 5: Divisor & Ações */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className="rte-btn"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Inserir Divisor de Capítulo"
            aria-label="Inserir Divisor"
          >
            <i className="fa-solid fa-minus"></i>
          </button>
          <button
            type="button"
            className="rte-btn"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            title="Limpar Formatação"
            aria-label="Limpar Formatação"
          >
            <i className="fa-solid fa-remove-format"></i>
          </button>
        </div>

        <div className="rte-divider"></div>

        {/* Grupo 6: Histórico (Undo / Redo) */}
        <div className="rte-toolbar-group">
          <button
            type="button"
            className="rte-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            <i className="fa-solid fa-rotate-left"></i>
          </button>
          <button
            type="button"
            className="rte-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Refazer (Ctrl+Y)"
            aria-label="Refazer"
          >
            <i className="fa-solid fa-rotate-right"></i>
          </button>
        </div>
      </div>

      {/* 2. ÁREA DE ESCRITA TIPOGRÁFICA */}
      <div className="rte-content-wrapper" style={{ minHeight }}>
        <EditorContent editor={editor} className="rte-editor-content" />
      </div>

      {/* 3. RODAPÉ EDITORIAL & STATUS DO AUTO-SAVE */}
      <div className="rte-footer">
        <div className="rte-metrics">
          <i className="fa-solid fa-feather-pointed rte-metrics-icon"></i>
          <span>
            {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'}
          </span>
          <span className="rte-bullet">•</span>
          <span>{charCount} caracteres</span>
        </div>

        <div className="rte-autosave-badge">
          {saveStatus === 'saving' && (
            <span className="rte-status-saving">
              <i className="fa-solid fa-circle-notch fa-spin"></i>
              Salvando rascunho...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="rte-status-saved">
              <i className="fa-solid fa-circle-check"></i>
              {lastSavedAt ? `Salvo às ${formatTime(lastSavedAt)}` : 'Rascunho salvo'}
            </span>
          )}
          {saveStatus === 'unsaved' && (
            <span className="rte-status-unsaved">
              <i className="fa-solid fa-pen-clip"></i>
              Modificações pendentes...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
