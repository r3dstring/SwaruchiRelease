import { useState } from 'react';
import { api } from '../api';
import { useTopics } from '../context/TopicsContext';
import { useIsAdmin } from '../context/AuthContext';

export default function TopicManager() {
  const isAdmin = useIsAdmin();
  const { topics, refresh } = useTopics();
  const [expanded, setExpanded] = useState({});
  const [editingLeaf, setEditingLeaf] = useState(null); // { id, label, keywords }
  const [newBranch, setNewBranch] = useState({ open: false, label: '', icon: '📁' });
  const [newLeaf, setNewLeaf] = useState({ branchId: null, label: '', keywords: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return <div className="max-w-lg mx-auto px-4 py-16 text-center"><p className="text-4xl mb-4">🚫</p><p className="font-bold text-gray-700">Admin access required</p></div>;

  const toggle = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleCreateBranch = async () => {
    if (!newBranch.label.trim()) return;
    setBusy(true); setError('');
    try {
      await api.adminCreateBranch({ label: newBranch.label.trim(), icon: newBranch.icon.trim() || '📁' });
      setNewBranch({ open: false, label: '', icon: '📁' });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleCreateLeaf = async (branchId) => {
    if (!newLeaf.label.trim()) return;
    setBusy(true); setError('');
    try {
      await api.adminCreateLeaf({ parent_id: branchId, label: newLeaf.label.trim(), keywords: newLeaf.keywords });
      setNewLeaf({ branchId: null, label: '', keywords: '' });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleSaveLeafEdit = async () => {
    if (!editingLeaf?.label.trim()) return;
    setBusy(true); setError('');
    try {
      await api.adminUpdateTopic(editingLeaf.id, { label: editingLeaf.label.trim(), keywords: editingLeaf.keywords });
      setEditingLeaf(null);
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleDeleteBranch = async (id, label) => {
    if (!confirm(`Delete "${label}" and all its topics? This cannot be undone.`)) return;
    setBusy(true);
    try { await api.adminDeleteTopic(id); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleDeleteLeaf = async (id, label) => {
    if (!confirm(`Delete "${label}"? Existing quiz history for it is kept, but it won't be selectable anymore.`)) return;
    setBusy(true);
    try { await api.adminDeleteTopic(id); await refresh(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <span className="text-5xl">🗂️</span>
        <h1 className="font-display font-900 text-2xl text-gray-800 mt-2">Manage Topics</h1>
        <p className="text-sm text-gray-400 font-medium">Edit the topic tree used for quizzes and the Knowledge Map</p>
      </div>

      {error && <div className="bg-red-50 text-coral text-sm font-medium px-4 py-2.5 rounded-xl mb-4">{error}</div>}

      {/* Add branch */}
      {newBranch.open ? (
        <div className="card mb-4 border-lime-400/40">
          <p className="text-sm font-bold text-gray-600 mb-3">New Branch</p>
          <div className="flex gap-2 mb-3">
            <input value={newBranch.icon} onChange={e=>setNewBranch(b=>({...b, icon: e.target.value}))} placeholder="📁" className="input-field w-16 text-center" maxLength={2}/>
            <input value={newBranch.label} onChange={e=>setNewBranch(b=>({...b, label: e.target.value}))} placeholder="Branch name" className="input-field flex-1"/>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setNewBranch({open:false,label:'',icon:'📁'})} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button onClick={handleCreateBranch} disabled={busy||!newBranch.label.trim()} className="btn-primary text-sm py-2 px-4">Create Branch</button>
          </div>
        </div>
      ) : (
        <button onClick={()=>setNewBranch(b=>({...b, open:true}))} className="w-full btn-secondary mb-4 text-sm">+ Add Branch</button>
      )}

      {/* Tree */}
      <div className="space-y-3">
        {topics.map(branch => {
          const isOpen = expanded[branch.id];
          return (
            <div key={branch.id} className="card p-0 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4">
                <button onClick={()=>toggle(branch.id)} className="flex items-center gap-3 flex-1 text-left">
                  <span className="text-xl">{branch.icon}</span>
                  <span className="font-display font-800 text-gray-800">{branch.label}</span>
                  <span className="text-xs text-gray-400 font-medium">({branch.children.length})</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ml-auto ${isOpen?'rotate-90':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
                <button onClick={()=>handleDeleteBranch(branch.id, branch.label)} className="text-gray-300 hover:text-coral transition-colors p-1" title="Delete branch">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-2">
                  {branch.children.map(leaf => (
                    <div key={leaf.id}>
                      {editingLeaf?.id === leaf.id ? (
                        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                          <input value={editingLeaf.label} onChange={e=>setEditingLeaf(l=>({...l, label:e.target.value}))} className="input-field text-sm py-2"/>
                          <textarea value={editingLeaf.keywords} onChange={e=>setEditingLeaf(l=>({...l, keywords:e.target.value}))}
                            placeholder="Keywords, comma separated (used to find relevant document passages)"
                            className="w-full text-sm px-3 py-2 rounded-lg border-2 border-gray-200 bg-white resize-none focus:outline-none focus:border-lime-400" rows={2}/>
                          <div className="flex gap-2">
                            <button onClick={()=>setEditingLeaf(null)} className="text-xs text-gray-400 font-medium px-3 py-1.5">Cancel</button>
                            <button onClick={handleSaveLeafEdit} disabled={busy} className="text-xs bg-lime-400 text-white font-bold px-4 py-1.5 rounded-lg">Save</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span className="text-sm text-gray-700 flex-1 py-1.5">{leaf.label}</span>
                          <span className="text-xs text-gray-300">{(leaf.keywords||[]).length} keywords</span>
                          <button onClick={()=>setEditingLeaf({id:leaf.id, label:leaf.label, keywords:(leaf.keywords||[]).join(', ')})} className="text-xs text-sky font-medium px-2 opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                          <button onClick={()=>handleDeleteLeaf(leaf.id, leaf.label)} className="text-xs text-coral font-medium px-2 opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add leaf */}
                  {newLeaf.branchId === branch.id ? (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2 mt-2">
                      <input value={newLeaf.label} onChange={e=>setNewLeaf(l=>({...l, label:e.target.value}))} placeholder="Topic name" className="input-field text-sm py-2"/>
                      <textarea value={newLeaf.keywords} onChange={e=>setNewLeaf(l=>({...l, keywords:e.target.value}))}
                        placeholder="Keywords, comma separated (optional — improves retrieval accuracy)"
                        className="w-full text-sm px-3 py-2 rounded-lg border-2 border-gray-200 bg-white resize-none focus:outline-none focus:border-lime-400" rows={2}/>
                      <div className="flex gap-2">
                        <button onClick={()=>setNewLeaf({branchId:null,label:'',keywords:''})} className="text-xs text-gray-400 font-medium px-3 py-1.5">Cancel</button>
                        <button onClick={()=>handleCreateLeaf(branch.id)} disabled={busy||!newLeaf.label.trim()} className="text-xs bg-lime-400 text-white font-bold px-4 py-1.5 rounded-lg">Add Topic</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={()=>setNewLeaf({branchId:branch.id,label:'',keywords:''})} className="text-xs text-lime-600 font-bold hover:text-lime-700 transition-colors mt-1">+ Add topic to {branch.label}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {topics.length === 0 && <div className="card text-center py-8"><p className="text-gray-400 font-medium">No topics yet — add a branch to get started</p></div>}
    </div>
  );
}
