const SPREADSHEET_ID = '1f-xE9mroa3sTeoZMpLVIvY8fdfeOpmWXc_SxHP3_NWQ';
const RANGE = "'Listagem de Membros'!D19:L98";
const API_KEY = 'AIzaSyARN99qktfHU0auyX5LpJ84pfRrbS4vWk8'; 
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyqln3UbuhbJJ0NUPrM5Uu7Zpc4FbzTwB_gwxTQ7_8dJjECz-lLYfcsmVjLi606hL_Orw/exec';
const EXIT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyyLrYriyxp1Hm9KVZOGriJ14kM27VbbnOwv4jRldEWVWAoNaTTIyrIquXGIZkqS9rfqQ/exec';
const CORS_PROXY = 'https://corsproxy.io/?';
const HABBO_API_BASE = 'https://www.habbo.com.br/api/public/users';
const HABBO_GROUP_ID = 'g-hhbr-0c67884555ea35f73e0f5cfca8d52b03';

let groupStatusCache = {};
let forumMembersCache = new Set();

// Track members who were set to RL today (in current session)
let rlAddedToday = new Set();

const CARGOS_OFICIAIS = [
    "Líder", "Vice-Líder", "Consultor",
    "Diretoria da Administração", "Diretoria da Assistência", "Diretoria da Atualização",
    "Diretoria das Finanças", "Diretoria da Fiscalização", "Diretoria da Contabilidade",
    "Assistente do Departamento de Atividades", "Assistente do Departamento de Marketing e Tecnologia",
    "Membro do Departamento de Atividades", "Membro do Departamento de Marketing e Tecnologia"
];

let allMembers = [], isAddingNew = false, currentEditingIndex = -1, actionQueue = [], actionQueueTotal = 0;
const monthMapReverse = { "jan.": "01", "fev.": "02", "mar.": "03", "abr.": "04", "maio": "05", "jun.": "06", "jul.": "07", "ago.": "08", "set.": "09", "out.": "10", "nov.": "11", "dez.": "12" };

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid ${icons[type]} text-lg"></i><span class="text-sm font-medium text-white">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Check if today is Monday
function isMonday() {
    return new Date().getDay() === 1;
}

// Check if a return date has passed
function isReturnDateOverdue(terminoStr) {
    if (!terminoStr || terminoStr === '-') return false;
    const terminoDate = getDateObject(terminoStr);
    if (isNaN(terminoDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return terminoDate < today;
}

// Check if member should blink for RL on Monday
function shouldBlinkRLOnMonday(member) {
    if (!isMonday()) return false;
    if (!member.licenca.isRL) return false;
    // Don't blink if this member was added to RL today
    const cleanNick = member.nickname.replace(/^@/, '').toLowerCase();
    if (rlAddedToday.has(cleanNick)) return false;
    return true;
}

// Forum Check Functions
function openForumCheckModal() {
    const modal = document.getElementById('forumCheckModal');
    modal.classList.remove('hidden');
    document.getElementById('forumPasteArea').value = '';
    document.getElementById('forumCheckResult').classList.add('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
    });
}

function closeForumCheckModal() {
    const modal = document.getElementById('forumCheckModal');
    modal.classList.add('opacity-0', 'pointer-events-none');
    modal.querySelector('div').classList.remove('scale-100');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

function clearForumPaste() {
    document.getElementById('forumPasteArea').value = '';
    document.getElementById('forumCheckResult').classList.add('hidden');
    forumMembersCache.clear();
}

function verifyForumMembers() {
    const text = document.getElementById('forumPasteArea').value;
    if (!text.trim()) {
        showToast('Cole o conteúdo das páginas do grupo', 'warning');
        return;
    }
    
    // Parse pasted content - format: "Enviar uma mensagem privada\tNickname\tNumber"
    const lines = text.split('\n');
    const forumNicks = new Set();
    
    for (const line of lines) {
        // Look for lines with "Enviar uma mensagem privada"
        if (line.includes('Enviar uma mensagem privada')) {
            // Split by tab character
            const parts = line.split('\t');
            
            // The nickname should be in the second column (index 1)
            if (parts.length >= 2) {
                let nick = parts[1].trim();
                
                // Skip if it's empty or the header row
                if (nick && nick !== 'Nome de usuário' && nick.length > 0) {
                    // Store the nick as-is (preserving special chars like , . - etc)
                    // Just lowercase for comparison
                    forumNicks.add(nick.toLowerCase());
                }
            }
        }
    }
    
    forumMembersCache = forumNicks;
    
    // Compare with allMembers
    const results = { inForum: [], missing: [] };
    
    allMembers.forEach(member => {
        const cleanNick = member.nickname.replace(/^@/, '').trim().toLowerCase();
        if (forumNicks.has(cleanNick)) {
            results.inForum.push(member.nickname);
        } else {
            results.missing.push(member.nickname);
        }
    });
    
    // Display results
    document.getElementById('forumOkCount').textContent = results.inForum.length;
    document.getElementById('forumMissingCount').textContent = results.missing.length;
    
    const resultList = document.getElementById('forumResultList');
    resultList.innerHTML = '';
    
    if (results.missing.length > 0) {
        results.missing.forEach(nick => {
            resultList.innerHTML += `<div class="forum-result-item forum-missing"><i class="fa-solid fa-xmark"></i><span>${nick}</span><span class="text-xs ml-auto opacity-70">Não está no grupo do fórum</span></div>`;
        });
    }
    
    results.inForum.forEach(nick => {
        resultList.innerHTML += `<div class="forum-result-item forum-ok"><i class="fa-solid fa-check"></i><span>${nick}</span></div>`;
    });
    
    document.getElementById('forumCheckResult').classList.remove('hidden');
    
    if (results.missing.length > 0) {
        showToast(`${results.missing.length} membro(s) não estão no grupo do fórum!`, 'warning');
    } else {
        showToast('Todos os membros estão no grupo do fórum!', 'success');
    }
    
    renderList(); // Re-render to show forum status badges
}

function getForumBadgeHTML(nickname) {
    if (forumMembersCache.size === 0) return '';
    const cleanNick = nickname.replace(/^@/, '').trim().toLowerCase();
    if (forumMembersCache.has(cleanNick)) {
        return `<span class="group-badge"><i class="fa-solid fa-id-card icon-ok text-xs"></i><span class="tooltip"><i class="fa-solid fa-check-circle text-emerald-400 mr-1"></i>No grupo do fórum</span></span>`;
    } else {
        return `<span class="group-badge"><i class="fa-solid fa-id-card icon-error text-xs"></i><span class="tooltip"><i class="fa-solid fa-exclamation-triangle text-red-400 mr-1"></i>NÃO está no fórum! Adicione ao subfórum.</span></span>`;
    }
}

// Habbo Group Check Functions
let isCheckingGroups = false;

async function checkUserInGroup(nickname) {
    const cleanNick = nickname.replace(/^@/, '').trim();
    if (groupStatusCache[cleanNick]?.status && groupStatusCache[cleanNick].status !== 'checking') return groupStatusCache[cleanNick];
    groupStatusCache[cleanNick] = { status: 'checking', message: 'Verificando...' };
    try {
        const userUrl = `${CORS_PROXY}${encodeURIComponent(HABBO_API_BASE + '?name=' + encodeURIComponent(cleanNick))}`;
        const userResponse = await fetch(userUrl);
        if (!userResponse.ok) { groupStatusCache[cleanNick] = { status: 'not_found', message: 'Usuário não encontrado no Habbo' }; return groupStatusCache[cleanNick]; }
        const userData = await userResponse.json();
        const groupsUrl = `${CORS_PROXY}${encodeURIComponent(HABBO_API_BASE + '/' + userData.uniqueId + '/groups')}`;
        const groupsResponse = await fetch(groupsUrl);
        if (!groupsResponse.ok) { groupStatusCache[cleanNick] = { status: 'error', message: 'Erro ao verificar grupos' }; return groupStatusCache[cleanNick]; }
        const groupsData = await groupsResponse.json();
        const isInGroup = groupsData.some(group => group.id === HABBO_GROUP_ID);
        groupStatusCache[cleanNick] = isInGroup ? { status: 'in_group', message: 'Membro está no grupo do CEM ✓' } : { status: 'not_in_group', message: 'Não está no grupo! Oriente a pedir entrada no grupo do CEM no Habbo.' };
        return groupStatusCache[cleanNick];
    } catch (error) {
        groupStatusCache[cleanNick] = { status: 'error', message: 'Erro de conexão com API do Habbo' };
        return groupStatusCache[cleanNick];
    }
}

async function checkAllMembersGroupStatus() {
    if (isCheckingGroups) return;
    isCheckingGroups = true;
    allMembers.forEach(m => { const n = m.nickname.replace(/^@/, '').trim(); if (!groupStatusCache[n]) groupStatusCache[n] = { status: 'checking', message: 'Aguardando...' }; });
    renderList();
    const pending = allMembers.filter(m => groupStatusCache[m.nickname.replace(/^@/, '').trim()]?.status === 'checking');
    for (let i = 0; i < pending.length; i += 5) {
        await Promise.all(pending.slice(i, i + 5).map(m => checkUserInGroup(m.nickname)));
        renderList();
        await new Promise(r => setTimeout(r, 50));
    }
    isCheckingGroups = false;
    document.getElementById('btnCheckGroups').classList.remove('pulse-btn');
    showToast('Verificação de grupos concluída!', 'success');
}

function refreshGroupStatus() { groupStatusCache = {}; checkAllMembersGroupStatus(); }

function getGroupBadgeHTML(nickname) {
    const cleanNick = nickname.replace(/^@/, '').trim();
    const status = groupStatusCache[cleanNick];
    if (!status) return `<span class="group-badge" onclick="event.stopPropagation(); checkSingleUser('${cleanNick}')"><i class="fa-solid fa-users-slash text-slate-500 text-xs"></i><span class="tooltip">Clique para verificar</span></span>`;
    const icons = { checking: 'fa-spinner icon-loading', in_group: 'fa-users icon-ok', not_in_group: 'fa-users icon-error', not_found: 'fa-user-xmark icon-pending', error: 'fa-exclamation-circle text-slate-500' };
    return `<span class="group-badge" ${status.status === 'error' ? `onclick="event.stopPropagation(); checkSingleUser('${cleanNick}')"` : ''}><i class="fa-solid ${icons[status.status] || icons.error} text-sm"></i><span class="tooltip">${status.message}</span></span>`;
}

async function checkSingleUser(nickname) {
    delete groupStatusCache[nickname];
    showToast(`Verificando ${nickname}...`, 'info');
    await checkUserInGroup(nickname);
    renderList();
}

function formatDatePretty(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    let dateObj;
    if (dateStr.includes('/')) { const p = dateStr.split('/'); if (p.length === 3) dateObj = new Date(p[2], p[1] - 1, p[0]); }
    else dateObj = new Date(dateStr);
    if (!dateObj || isNaN(dateObj.getTime())) return dateStr;
    const day = String(dateObj.getDate()).padStart(2, '0'), year = dateObj.getFullYear();
    let month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObj).toLowerCase();
    if (month === 'mai') month = 'maio'; if (!month.includes('.') && month !== 'maio') month += '.';
    return `${day} ${month} ${year}`;
}

function parsePrettyToDate(prettyStr) {
    if (!prettyStr || prettyStr === '-') return null;
    const p = prettyStr.split(' '); if (p.length !== 3) return null;
    const monthNum = monthMapReverse[p[1].toLowerCase()]; if (!monthNum) return null;
    return `${p[0]}/${monthNum}/${p[2]}`;
}

function parseFlatpickrDate(dateObj) {
    if (!dateObj) return '-';
    const day = String(dateObj.getDate()).padStart(2, '0'), year = dateObj.getFullYear();
    let month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(dateObj).toLowerCase();
    if (month === 'mai') month = 'maio'; if (!month.includes('.') && month !== 'maio') month += '.';
    return `${day} ${month} ${year}`;
}

function getTodayFormatted() { return new Date().toLocaleDateString('pt-BR'); }
function getRoleRank(cargo) { const i = CARGOS_OFICIAIS.indexOf(cargo); return i === -1 ? 999 : i; }
function getDateObject(dateStr) {
    if (!dateStr || dateStr === '-') return new Date(8640000000000000);
    const p = dateStr.split(' '); if (p.length !== 3) return new Date(8640000000000000);
    const monthNum = monthMapReverse[p[1].toLowerCase()]; if (!monthNum) return new Date(8640000000000000);
    return new Date(parseInt(p[2]), parseInt(monthNum) - 1, parseInt(p[0]));
}

function sortMembers() { allMembers.sort((a, b) => { const r = getRoleRank(a.cargo) - getRoleRank(b.cargo); return r !== 0 ? r : getDateObject(a.entrada) - getDateObject(b.entrada); }); }

function normalizeCargo(cargo) {
    if (!cargo) return '';
    const lower = cargo.toLowerCase().trim();
    const mappings = {
        'diretor(a) da administração': 'Diretoria da Administração', 'diretor(a) da atualização': 'Diretoria da Atualização',
        'diretor(a) da assistência': 'Diretoria da Assistência', 'diretor(a) das finanças': 'Diretoria das Finanças',
        'diretor(a) da fiscalização': 'Diretoria da Fiscalização', 'diretor(a) da contabilidade': 'Diretoria da Contabilidade',
        'membro do da': 'Membro do Departamento de Atividades', 'membro do dmt': 'Membro do Departamento de Marketing e Tecnologia',
        'assistente do da': 'Assistente do Departamento de Atividades', 'assistente do dmt': 'Assistente do Departamento de Marketing e Tecnologia',
        'da': 'Membro do Departamento de Atividades', 'dmt': 'Membro do Departamento de Marketing e Tecnologia',
        'departamento de atividades': 'Membro do Departamento de Atividades', 
        'departamento de marketing e tecnologia': 'Membro do Departamento de Marketing e Tecnologia'
    };
    return mappings[lower] || CARGOS_OFICIAIS.find(c => c.toLowerCase() === lower) || cargo;
}

window.onload = () => { populateSelects(); fetchData(); initDatePickers(); };

function populateSelects() {
    ['editCargo', 'exitCargo', 'entryCargo', 'promotionCargo', 'rebaixamentoCargo', 'realocacaoCargo'].forEach(id => {
        const s = document.getElementById(id); if (!s) return; s.innerHTML = '';
        CARGOS_OFICIAIS.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; s.appendChild(o); });
    });
}

function initDatePickers() {
    const cfg = { dateFormat: "d/m/Y", allowInput: true, disableMobile: "true" };
    flatpickr("#editEntrada", cfg); flatpickr("#editPromocao", cfg); flatpickr("#editLicInicio", cfg);
    flatpickr("#exitDateEntry", cfg); flatpickr("#exitDateLeave", { ...cfg, defaultDate: "today" });
    flatpickr("#entryDate", { ...cfg, defaultDate: "today" }); flatpickr("#promotionDate", { ...cfg, defaultDate: "today" });
    flatpickr("#rebaixamentoDate", { ...cfg, defaultDate: "today" });
    flatpickr("#leaveDateStart", { ...cfg, defaultDate: "today", onChange: () => recalcLeaveEnd() });
}

async function fetchData() {
    const loading = document.getElementById('loading'), errorDiv = document.getElementById('error'), table = document.getElementById('mainTable');
    loading.classList.remove('hidden'); table.classList.add('opacity-50');
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${API_KEY}`);
        if (!response.ok) throw new Error('Falha na requisição');
        const data = await response.json(), rows = data.values;
        allMembers = rows ? rows.map(row => {
            if (!row[0] && !row[1]) return null;
            const isRL = row[8]?.toString().toUpperCase() === 'TRUE';
            const licInicio = row[5] ? formatDatePretty(row[5]) : '-';
            return { cargo: row[0] || '', nickname: row[1] || '', entrada: formatDatePretty(row[2] || '-'), promocao: formatDatePretty(row[3] || '-'),
                licenca: { inicio: licInicio, dias: row[6] || '', termino: row[7] ? formatDatePretty(row[7]) : '-', isRL },
                status: (licInicio !== '-' || isRL) ? 'leave' : 'active' };
        }).filter(Boolean) : [];
        sortMembers(); updateStats(); renderList(); errorDiv.classList.add('hidden'); showToast('Dados carregados', 'success');
    } catch (err) { document.getElementById('errorMsg').textContent = "Erro de conexão"; errorDiv.classList.remove('hidden'); showToast('Erro ao carregar', 'error'); }
    finally { loading.classList.add('hidden'); table.classList.remove('opacity-50'); }
}

async function syncData() {
    document.getElementById('loading').classList.remove('hidden');
    try {
        const payload = { action: 'save', membros: allMembers.map(m => ({ cargo: m.cargo, nickname: m.nickname, entrada: m.entrada, promocao: m.promocao, licenca: { inicio: m.licenca.inicio, dias: m.licenca.dias || '', isRL: m.licenca.isRL } })) };
        const response = await fetch(APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        const result = await response.json();
        if (result.status === 'success') { allMembers = result.data; updateStats(); renderList(); showToast('Dados salvos', 'success'); return result; }
        throw new Error(result.message);
    } catch (err) { showToast('Erro ao salvar: ' + err.message, 'error'); }
    finally { document.getElementById('loading').classList.add('hidden'); }
}

async function finalizeUpdate() { showToast('Finalizando...', 'info'); const r = await syncData(); if (r?.bbcode) openFinalModal(r.bbcode); }

function updateStats() {
    document.getElementById('totalMembers').textContent = allMembers.length;
    document.getElementById('activeMembers').textContent = allMembers.filter(m => m.status === 'active').length;
    document.getElementById('leaveMembers').textContent = allMembers.filter(m => m.status === 'leave').length;
}

function filterList() { const t = document.getElementById('searchInput').value.toLowerCase(); renderTableRows(allMembers.filter(m => m.nickname.toLowerCase().includes(t) || m.cargo.toLowerCase().includes(t))); }
function renderList() { filterList(); }

function renderTableRows(members) {
    const tbody = document.getElementById('membersTableBody'), emptyState = document.getElementById('emptyState');
    tbody.innerHTML = '';
    if (!members.length) { emptyState.classList.remove('hidden'); return; }
    emptyState.classList.add('hidden');
    members.forEach((m, idx) => {
        const tr = document.createElement('tr');
        const realIdx = allMembers.indexOf(m);
        let statusCell = `<span class="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg text-xs font-medium border border-emerald-500/30">Ativo</span>`;
        let licStart = "-", licEnd = "-";
        let rowClass = "";
        let warningBadge = "";
        
        // Check for blinking conditions
        const isOverdue = m.status === 'leave' && !m.licenca.isRL && isReturnDateOverdue(m.licenca.termino);
        const shouldBlinkRL = shouldBlinkRLOnMonday(m);
        
        if (m.status === 'leave') {
            statusCell = m.licenca.isRL ? `<span class="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-lg text-xs font-medium border border-purple-500/30">RL</span>` : `<span class="bg-amber-500/20 text-amber-400 px-2 py-1 rounded-lg text-xs font-medium border border-amber-500/30">Licença</span>`;
            // Only apply opacity to regular leave, not RL
            if (!m.licenca.isRL) {
                tr.className = "opacity-60";
            }
            if (m.licenca.inicio !== '-') licStart = `<span class="text-slate-300">${m.licenca.inicio}</span>`;
            if (m.licenca.termino !== '-') {
                if (isOverdue) {
                    licEnd = `<span class="text-red-400 font-bold">${m.licenca.termino}</span>`;
                } else {
                    licEnd = `<span class="text-amber-300 font-semibold">${m.licenca.termino}</span>`;
                }
            }
        }
        
        // Apply blinking classes
        if (isOverdue) {
            rowClass = "blink-warning-overdue";
            warningBadge = `<span class="warning-badge warning-badge-overdue ml-2 cursor-pointer group-badge" onclick="event.stopPropagation(); openOverdueModal(${realIdx})"><i class="fa-solid fa-clock"></i> VENCIDO<span class="tooltip">Licença vencida em ${m.licenca.termino}. Clique para colocar em RL.</span></span>`;
        } else if (shouldBlinkRL) {
            rowClass = "blink-warning-rl";
            warningBadge = `<span class="warning-badge warning-badge-rl ml-2"><i class="fa-solid fa-bell"></i> REMOVER RL</span>`;
        }
        
        if (rowClass) {
            tr.className = rowClass;
        }
        tr.onclick = e => { if (!e.target.closest('.btn-trash') && !e.target.closest('.group-badge')) openEditModal(realIdx); };
        tr.innerHTML = `<td class="text-center text-slate-500 font-medium">${idx + 1}</td>
            <td><div class="flex items-center gap-2">${getGroupBadgeHTML(m.nickname)}${getForumBadgeHTML(m.nickname)}<span class="font-semibold text-white">${m.nickname}</span>${warningBadge}</div></td>
            <td class="text-slate-300">${m.cargo}</td><td class="text-center text-slate-400">${m.entrada}</td><td class="text-center text-slate-400">${m.promocao}</td>
            <td class="text-center">${statusCell}</td><td class="text-center text-slate-400">${licStart}</td><td class="text-center">${licEnd}</td>
            <td class="text-center"><button onclick="triggerExitFlow(event, ${realIdx})" class="btn-trash text-slate-500 p-2 rounded-lg transition-colors" title="Remover"><i class="fa-solid fa-trash-can text-xs"></i></button></td>`;
        tbody.appendChild(tr);
    });
}

function openImportModal() { showModalGeneric('importModal'); document.getElementById('importText').value = ""; }
function closeImportModal() { closeModalGeneric('importModal'); }

function showModalGeneric(id) {
    const m = document.getElementById(id); m.classList.remove('hidden');
    requestAnimationFrame(() => { m.classList.remove('opacity-0', 'pointer-events-none'); m.querySelector('div').classList.remove('scale-95'); m.querySelector('div').classList.add('scale-100'); });
}
function closeModalGeneric(id) {
    const m = document.getElementById(id); m.classList.add('opacity-0', 'pointer-events-none');
    m.querySelector('div').classList.remove('scale-100'); m.querySelector('div').classList.add('scale-95');
    setTimeout(() => m.classList.add('hidden'), 300);
}

function processImport() {
    const text = document.getElementById('importText').value;
    if (!text.trim()) { showToast('Cole o texto para importar', 'warning'); return; }
    const lines = text.split('\n');
    let currentAction = null, pendingActions = [], tempMember = {};
    const patterns = { nickname: /(?:Nickname(?:\(s\))?|Nick(?:name)?(?:\s+atual)?):\s*(.*)/i, nickname_atual: /Nickname atual:\s*(.*)/i, nickname_novo: /Novo nickname:\s*(.*)/i, cargo: /(?:Cargo|Departamento):\s*(.*)/i, cargo_atual: /Cargo atual:\s*(.*)/i, novo_cargo: /Novo Cargo:\s*(.*)/i, data: /Data:\s*(.*)/i, dias: /Quantidade de dias:\s*(\d+)/i, motivo: /Motivo:\s*(.*)/i };
    
    for (const line of lines) {
        const l = line.trim(); if (!l) continue;
        // Ordem importa! Verificar padrões mais específicos primeiro
        if (/ENTRADA DE MEMBROS/i.test(l) || /REINTEGRA[ÇC][ÃA]O/i.test(l)) { processBlock(); currentAction = 'ENTRY'; tempMember = {}; }
        else if (/MIGRA[ÇC][ÃA]O DE CORPO/i.test(l)) { processBlock(); currentAction = 'MIGRATION'; tempMember = {}; }
        else if (/PROLONGAMENTO DE LICEN[ÇC]A/i.test(l)) { processBlock(); currentAction = 'EXTEND_LEAVE'; tempMember = {}; }
        else if (/RETORNO DE LICEN[ÇC]A/i.test(l)) { processBlock(); currentAction = 'RETURN'; tempMember = {}; }
        else if (/LICEN[ÇC]A/i.test(l) && /RESERVA/i.test(l)) { processBlock(); currentAction = 'LEAVE'; tempMember = {}; }
        else if (/^SA[IÍ]DA$/i.test(l) || /^SA[IÍ]DA\s*$/i.test(l)) { processBlock(); currentAction = 'EXIT'; tempMember = { exitType: 'saida' }; }
        else if (/EXPULS[ÃA]O/i.test(l)) { processBlock(); currentAction = 'EXIT'; tempMember = { exitType: 'expulsao' }; }
        else if (/EXONERA[ÇC][ÃA]O/i.test(l)) { processBlock(); currentAction = 'EXIT'; tempMember = { exitType: 'exoneracao' }; }
        else if (/PROMO[ÇC][ÃA]O/i.test(l)) { processBlock(); currentAction = 'PROMOTION'; tempMember = {}; }
        else if (/REBAIXAMENTO/i.test(l)) { processBlock(); currentAction = 'REBAIXAMENTO'; tempMember = {}; }
        else if (/REALOCA[ÇC][ÃA]O/i.test(l)) { processBlock(); currentAction = 'REALOCACAO'; tempMember = {}; }
        else if (/TRANSFER[ÊE]NCIA DE CONTA/i.test(l)) { processBlock(); currentAction = 'TRANSFER'; tempMember = {}; }
        else if (currentAction) {
            let m;
            if ((m = l.match(patterns.nickname_atual))) tempMember.nickname_atual = m[1].trim();
            else if ((m = l.match(patterns.nickname_novo))) tempMember.nickname_novo = m[1].trim();
            else if ((m = l.match(patterns.nickname))) tempMember.nickname = m[1].trim();
            if ((m = l.match(patterns.cargo_atual))) tempMember.cargo_atual = m[1].trim();
            else if ((m = l.match(patterns.novo_cargo))) tempMember.novo_cargo = m[1].trim();
            else if ((m = l.match(patterns.cargo))) tempMember.cargo = m[1].trim();
            if ((m = l.match(patterns.data))) tempMember.data = m[1].trim();
            if ((m = l.match(patterns.dias))) tempMember.dias = parseInt(m[1]);
            if ((m = l.match(patterns.motivo))) tempMember.motivo = m[1].trim();
        }
    }
    processBlock();
    
    function processBlock() {
        if (!currentAction) return;
        const mainNick = tempMember.nickname || tempMember.nickname_atual; if (!mainNick && currentAction !== 'TRANSFER') return;
        const nicks = mainNick ? mainNick.split(/[\/&]/).map(n => n.trim()) : [];
        nicks.forEach(nick => {
            const cleanNick = nick.replace(/^@/, '').toLowerCase();
            const idx = allMembers.findIndex(m => m.nickname.toLowerCase().replace(/^@/, '') === cleanNick);
            if (currentAction === 'ENTRY' || currentAction === 'MIGRATION') pendingActions.push({ type: 'ENTRY', data: { nickname: nick, cargo: normalizeCargo(tempMember.cargo || 'Membro do Departamento de Atividades'), date: tempMember.data || getTodayFormatted() } });
            else if (currentAction === 'EXIT' && idx > -1) pendingActions.push({ type: 'EXIT', data: { nickname: allMembers[idx].nickname, reason: tempMember.motivo || "", exitType: tempMember.exitType || 'saida', memberIndex: idx } });
            else if (currentAction === 'LEAVE' && idx > -1) pendingActions.push({ type: 'LEAVE', data: { nickname: allMembers[idx].nickname, days: tempMember.dias || 7, memberIndex: idx } });
            else if (currentAction === 'EXTEND_LEAVE' && idx > -1) pendingActions.push({ type: 'EXTEND_LEAVE', data: { nickname: allMembers[idx].nickname, days: tempMember.dias || 7, memberIndex: idx } });
            else if (currentAction === 'RETURN' && idx > -1) pendingActions.push({ type: 'RETURN', data: { nickname: allMembers[idx].nickname, memberIndex: idx } });
            else if (currentAction === 'PROMOTION' && idx > -1) pendingActions.push({ type: 'PROMOTION', data: { nickname: allMembers[idx].nickname, cargo: normalizeCargo(tempMember.novo_cargo || tempMember.cargo || ''), date: tempMember.data || getTodayFormatted(), memberIndex: idx } });
            else if (currentAction === 'REBAIXAMENTO' && idx > -1) pendingActions.push({ type: 'REBAIXAMENTO', data: { nickname: allMembers[idx].nickname, cargo: normalizeCargo(tempMember.novo_cargo || tempMember.cargo || ''), date: tempMember.data || getTodayFormatted(), memberIndex: idx } });
            else if (currentAction === 'REALOCACAO' && idx > -1) pendingActions.push({ type: 'REALOCACAO', data: { nickname: allMembers[idx].nickname, cargoAtual: allMembers[idx].cargo, cargo: normalizeCargo(tempMember.novo_cargo || tempMember.cargo || ''), memberIndex: idx } });
            else if (currentAction === 'TRANSFER' && idx > -1) pendingActions.push({ type: 'TRANSFER', data: { nickname: allMembers[idx].nickname, nicknameNovo: tempMember.nickname_novo || '', memberIndex: idx } });
        });
    }
    
    closeImportModal();
    if (pendingActions.length) { actionQueue = pendingActions; actionQueueTotal = pendingActions.length; showToast(`${actionQueueTotal} ação(ões) detectada(s)`, 'info'); processNextQueueItem(); }
    else showToast('Nenhuma ação detectada', 'warning');
}

function processNextQueueItem() {
    if (!actionQueue.length) { showToast('Todas as ações processadas!', 'success'); syncData(); return; }
    const item = actionQueue[0], currentNum = actionQueueTotal - actionQueue.length + 1;
    const labelSuffix = actionQueue.length > 1 ? ` (${currentNum}/${actionQueueTotal})` : '', btnLabel = actionQueue.length > 1 ? "Confirmar e Próximo" : "Confirmar";
    currentEditingIndex = item.data.nickname ? allMembers.findIndex(m => m.nickname.toLowerCase().replace(/^@/, '') === item.data.nickname.replace(/^@/, '').toLowerCase()) : -1;
    if (currentEditingIndex === -1 && item.type !== 'ENTRY') { showToast(`Membro "${item.data.nickname}" não encontrado`, 'warning'); actionQueue.shift(); setTimeout(processNextQueueItem, 300); return; }
    const handlers = { ENTRY: openEntryModal, EXIT: openExitModalForQueue, LEAVE: openLeaveModalForQueue, EXTEND_LEAVE: openExtendLeaveModal, RETURN: openReturnModal, PROMOTION: openPromotionModal, REBAIXAMENTO: openRebaixamentoModal, REALOCACAO: openRealocacaoModal, TRANSFER: openTransferModal };
    (handlers[item.type] || skipCurrentAction)(item.data, labelSuffix, btnLabel);
}

function skipCurrentAction() { closeAllModals(); if (actionQueue.length) { actionQueue.shift(); showToast('Ação pulada', 'warning'); setTimeout(processNextQueueItem, 300); } }
function proceedQueue() { if (actionQueue.length) { actionQueue.shift(); closeAllModals(); setTimeout(processNextQueueItem, 300); } else { closeAllModals(); syncData(); } }
function closeAllModals() { ['exitModal', 'leaveModal', 'entryModal', 'promotionModal', 'returnModal', 'rebaixamentoModal', 'realocacaoModal', 'transferModal', 'extendLeaveModal'].forEach(id => { const m = document.getElementById(id); if (m) m.classList.add('opacity-0', 'pointer-events-none', 'hidden'); }); }

function showModal(modalId, contentId) { const m = document.getElementById(modalId), c = document.getElementById(contentId); m.classList.remove('hidden'); requestAnimationFrame(() => { m.classList.remove('opacity-0', 'pointer-events-none'); c.classList.remove('scale-95'); c.classList.add('scale-100'); }); }

function openEntryModal(data, labelSuffix, btnLabel) { document.getElementById('entryModalTitle').textContent = 'Confirmar Entrada' + labelSuffix; document.getElementById('entryBtnLabel').textContent = btnLabel; document.getElementById('entryNick').value = data.nickname; document.getElementById('entryCargo').value = data.cargo; document.getElementById('entryDate')._flatpickr.setDate(data.date); showModal('entryModal', 'entryModalContent'); }
function confirmEntry() {
    const nick = document.getElementById('entryNick').value.trim(); if (!nick) { showToast('Nickname obrigatório', 'error'); return; }
    const newMem = { nickname: nick, cargo: document.getElementById('entryCargo').value, entrada: formatDatePretty(document.getElementById('entryDate').value), promocao: '-', licenca: { inicio: '-', dias: '', termino: '-', isRL: false }, status: 'active' };
    const idx = allMembers.findIndex(m => m.nickname.toLowerCase() === nick.toLowerCase());
    if (idx > -1) allMembers[idx] = newMem; else allMembers.push(newMem);
    sortMembers(); updateStats(); renderList(); showToast(`${nick} adicionado`, 'success');
    checkUserInGroup(nick).then(() => renderList());
    proceedQueue();
}

function openPromotionModal(data, labelSuffix, btnLabel) { document.getElementById('promotionModalTitle').textContent = 'Confirmar Promoção' + labelSuffix; document.getElementById('promotionBtnLabel').textContent = btnLabel; document.getElementById('promotionNick').value = data.nickname; document.getElementById('promotionCargo').value = data.cargo || allMembers[data.memberIndex]?.cargo; document.getElementById('promotionDate')._flatpickr.setDate(data.date); showModal('promotionModal', 'promotionModalContent'); }
function confirmPromotion() { if (currentEditingIndex > -1) { allMembers[currentEditingIndex].cargo = document.getElementById('promotionCargo').value; allMembers[currentEditingIndex].promocao = formatDatePretty(document.getElementById('promotionDate').value); showToast(`${allMembers[currentEditingIndex].nickname} promovido`, 'success'); } sortMembers(); updateStats(); renderList(); proceedQueue(); }

function openRebaixamentoModal(data, labelSuffix, btnLabel) { document.getElementById('rebaixamentoModalTitle').textContent = 'Confirmar Rebaixamento' + labelSuffix; document.getElementById('rebaixamentoBtnLabel').textContent = btnLabel; document.getElementById('rebaixamentoNick').value = data.nickname; document.getElementById('rebaixamentoCargo').value = data.cargo || ''; document.getElementById('rebaixamentoDate')._flatpickr.setDate(data.date); showModal('rebaixamentoModal', 'rebaixamentoModalContent'); }
function confirmRebaixamento() { if (currentEditingIndex > -1) { allMembers[currentEditingIndex].cargo = document.getElementById('rebaixamentoCargo').value; allMembers[currentEditingIndex].promocao = formatDatePretty(document.getElementById('rebaixamentoDate').value); showToast(`${allMembers[currentEditingIndex].nickname} rebaixado`, 'success'); } sortMembers(); updateStats(); renderList(); proceedQueue(); }

function openRealocacaoModal(data, labelSuffix, btnLabel) { document.getElementById('realocacaoModalTitle').textContent = 'Confirmar Realocação' + labelSuffix; document.getElementById('realocacaoBtnLabel').textContent = btnLabel; document.getElementById('realocacaoNick').value = data.nickname; document.getElementById('realocacaoCargoAtual').value = data.cargoAtual; document.getElementById('realocacaoCargo').value = data.cargo || ''; showModal('realocacaoModal', 'realocacaoModalContent'); }
function confirmRealocacao() { if (currentEditingIndex > -1) { allMembers[currentEditingIndex].cargo = document.getElementById('realocacaoCargo').value; showToast(`${allMembers[currentEditingIndex].nickname} realocado`, 'success'); } sortMembers(); updateStats(); renderList(); proceedQueue(); }

function openTransferModal(data, labelSuffix, btnLabel) { document.getElementById('transferModalTitle').textContent = 'Confirmar Transferência' + labelSuffix; document.getElementById('transferBtnLabel').textContent = btnLabel; document.getElementById('transferNickAtual').value = data.nickname; document.getElementById('transferNickNovo').value = data.nicknameNovo || ''; showModal('transferModal', 'transferModalContent'); }
function confirmTransfer() { const novoNick = document.getElementById('transferNickNovo').value.trim(); if (!novoNick) { showToast('Novo nickname obrigatório', 'error'); return; } if (currentEditingIndex > -1) { const old = allMembers[currentEditingIndex].nickname; allMembers[currentEditingIndex].nickname = novoNick; delete groupStatusCache[old.replace(/^@/, '').trim()]; checkUserInGroup(novoNick).then(() => renderList()); showToast(`${old} → ${novoNick}`, 'success'); } updateStats(); renderList(); proceedQueue(); }

function openReturnModal(data, labelSuffix, btnLabel) { document.getElementById('returnModalTitle').textContent = 'Confirmar Retorno' + labelSuffix; document.getElementById('returnBtnLabel').textContent = btnLabel; document.getElementById('returnNick').value = data.nickname; showModal('returnModal', 'returnModalContent'); }

function openOverdueModal(idx) {
    currentEditingIndex = idx;
    actionQueue = [];
    actionQueueTotal = 1;
    const m = allMembers[idx];
    document.getElementById('returnModalTitle').textContent = 'Licença Vencida - Colocar em RL';
    document.getElementById('returnBtnLabel').textContent = 'Colocar em RL';
    document.getElementById('returnNick').value = m.nickname;
    showModal('returnModal', 'returnModalContent');
}
function confirmReturn() { 
    if (currentEditingIndex > -1) { 
        const member = allMembers[currentEditingIndex];
        const cleanNick = member.nickname.replace(/^@/, '').toLowerCase();
        
        // Set to RL mode instead of active
        member.status = 'leave';
        member.licenca.isRL = true;
        member.licenca.inicio = '-';
        member.licenca.dias = '';
        member.licenca.termino = '-';
        
        // Track that this member was added to RL today
        rlAddedToday.add(cleanNick);
        
        showToast(`${member.nickname} em modo RL`, 'success'); 
    } 
    updateStats(); 
    renderList(); 
    proceedQueue(); 
}

function openExitModalForQueue(data, labelSuffix, btnLabel) { if (currentEditingIndex === -1) { showToast('Membro não encontrado', 'error'); proceedQueue(); return; } const m = allMembers[currentEditingIndex]; document.getElementById('exitModalTitle').textContent = 'Formulário de Saída' + labelSuffix; document.getElementById('exitBtnLabel').textContent = btnLabel; document.getElementById('exitNick').value = m.nickname; document.getElementById('exitCargo').value = m.cargo; document.getElementById('exitDateEntry')._flatpickr.setDate(m.entrada === '-' ? '' : parsePrettyToDate(m.entrada)); document.getElementById('exitDateLeave')._flatpickr.setDate(new Date()); document.getElementById('exitReason').value = data.reason || ""; document.querySelectorAll('input[name="exitType"]').forEach(r => r.checked = r.value === (data.exitType || 'saida')); showModal('exitModal', 'exitModalContent'); }

async function sendExitToSheet(exitData) {
    try {
        const response = await fetch(EXIT_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'registerExit',
                ...exitData
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('Saída registrada na planilha!', 'success');
            return true;
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error('Erro ao registrar saída:', err);
        showToast('Erro ao registrar saída na planilha', 'error');
        return false;
    }
}

async function confirmExit() {
    if (currentEditingIndex > -1) {
        const member = allMembers[currentEditingIndex];
        const nick = member.nickname;
        const cargo = document.getElementById('exitCargo').value;
        const modalidade = document.querySelector('input[name="exitType"]:checked').value;
        const dataEntrada = document.getElementById('exitDateEntry').value;
        const dataSaida = document.getElementById('exitDateLeave').value;
        const motivo = document.getElementById('exitReason').value;
        
        // Valida campos obrigatórios
        if (!motivo.trim()) {
            showToast('Preencha o motivo da saída', 'error');
            return;
        }
        
        // Envia para a planilha de saídas
        await sendExitToSheet({
            nickname: nick,
            cargo: cargo,
            modalidade: modalidade,
            dataEntrada: dataEntrada,
            dataSaida: dataSaida,
            motivo: motivo
        });
        
        // Remove da listagem
        delete groupStatusCache[nick.replace(/^@/, '').trim()];
        // Also remove from RL tracking if present
        rlAddedToday.delete(nick.replace(/^@/, '').toLowerCase());
        allMembers.splice(currentEditingIndex, 1);
        showToast(`${nick} removido da listagem`, 'success');
    }
    updateStats();
    renderList();
    proceedQueue();
}

function openLeaveModalForQueue(data, labelSuffix, btnLabel) { document.getElementById('leaveModalTitle').textContent = 'Confirmar Licença' + labelSuffix; document.getElementById('leaveBtnLabel').textContent = btnLabel; document.getElementById('leaveNick').value = data.nickname; document.getElementById('leaveDays').value = data.days; document.getElementById('leaveDateStart')._flatpickr.setDate(new Date()); recalcLeaveEnd(); showModal('leaveModal', 'leaveModalContent'); }
function confirmLeave() { if (currentEditingIndex > -1) { const startStr = document.getElementById('leaveDateStart').value, days = parseInt(document.getElementById('leaveDays').value) || 7; if (startStr) { const p = startStr.split('/'), d = new Date(p[2], p[1]-1, p[0]); allMembers[currentEditingIndex].status = 'leave'; allMembers[currentEditingIndex].licenca.inicio = parseFlatpickrDate(d); allMembers[currentEditingIndex].licenca.dias = days; allMembers[currentEditingIndex].licenca.isRL = false; showToast(`${allMembers[currentEditingIndex].nickname} em licença`, 'success'); } } closeAllModals(); updateStats(); renderList(); proceedQueue(); }

function openExtendLeaveModal(data, labelSuffix, btnLabel) { document.getElementById('extendLeaveModalTitle').textContent = 'Prolongar Licença' + labelSuffix; document.getElementById('extendLeaveBtnLabel').textContent = btnLabel; document.getElementById('extendLeaveNick').value = data.nickname; document.getElementById('extendLeaveDays').value = data.days || 7; showModal('extendLeaveModal', 'extendLeaveModalContent'); }
function confirmExtendLeave() { if (currentEditingIndex > -1) { const add = parseInt(document.getElementById('extendLeaveDays').value) || 0, curr = parseInt(allMembers[currentEditingIndex].licenca.dias) || 0; allMembers[currentEditingIndex].licenca.dias = curr + add; showToast(`Licença de ${allMembers[currentEditingIndex].nickname} prolongada`, 'success'); } updateStats(); renderList(); proceedQueue(); }

function recalcLeaveEnd() { const days = parseInt(document.getElementById('leaveDays').value) || 0, startStr = document.getElementById('leaveDateStart').value; if (!startStr || !days) { document.getElementById('leaveDateEndDisplay').textContent = "-"; return; } const p = startStr.split('/'), d = new Date(p[2], p[1]-1, p[0]); d.setDate(d.getDate() + days); document.getElementById('leaveDateEndDisplay').textContent = parseFlatpickrDate(d); }

function openAddModal() { isAddingNew = true; currentEditingIndex = -1; document.getElementById('modalTitle').textContent = "Adicionar Membro"; document.getElementById('btnDeleteModal').classList.add('hidden'); document.getElementById('editNick').value = ""; document.getElementById('editCargo').value = CARGOS_OFICIAIS[CARGOS_OFICIAIS.length - 1]; document.getElementById('editEntrada')._flatpickr.clear(); document.getElementById('editPromocao')._flatpickr.clear(); document.getElementById('editLicInicio')._flatpickr.clear(); document.getElementById('editLicDias').value = ''; document.getElementById('editRL').checked = false; showModalUI(); }
function openEditModal(idx) { isAddingNew = false; currentEditingIndex = idx; const m = allMembers[idx]; document.getElementById('modalTitle').textContent = "Editar Membro"; document.getElementById('btnDeleteModal').classList.remove('hidden'); document.getElementById('editNick').value = m.nickname; document.getElementById('editCargo').value = m.cargo; document.getElementById('editEntrada')._flatpickr.setDate(m.entrada === '-' ? '' : parsePrettyToDate(m.entrada)); document.getElementById('editPromocao')._flatpickr.setDate(m.promocao === '-' ? '' : parsePrettyToDate(m.promocao)); document.getElementById('editLicInicio')._flatpickr.setDate(m.licenca.inicio === '-' ? '' : parsePrettyToDate(m.licenca.inicio)); document.getElementById('editLicDias').value = m.licenca.dias || ''; document.getElementById('editRL').checked = m.licenca.isRL; showModalUI(); }
function showModalUI() { showModal('editModal', 'modalContent'); }
function closeModal() { closeModalGeneric('editModal'); }

function openExitModal() { closeModal(); actionQueue = []; actionQueueTotal = 1; const m = allMembers[currentEditingIndex]; setTimeout(() => { document.getElementById('exitModalTitle').textContent = "Formulário de Saída"; document.getElementById('exitBtnLabel').textContent = "Enviar"; document.getElementById('exitNick').value = m.nickname; document.getElementById('exitCargo').value = m.cargo; document.getElementById('exitDateEntry')._flatpickr.setDate(m.entrada === '-' ? '' : parsePrettyToDate(m.entrada)); document.getElementById('exitDateLeave')._flatpickr.setDate(new Date()); document.getElementById('exitReason').value = ""; showModal('exitModal', 'exitModalContent'); }, 300); }
function triggerExitFlow(e, idx) { if (e) e.stopPropagation(); currentEditingIndex = idx; actionQueue = []; actionQueueTotal = 1; const m = allMembers[idx]; document.getElementById('exitModalTitle').textContent = "Formulário de Saída"; document.getElementById('exitBtnLabel').textContent = "Enviar"; document.getElementById('exitNick').value = m.nickname; document.getElementById('exitCargo').value = m.cargo; document.getElementById('exitDateEntry')._flatpickr.setDate(m.entrada === '-' ? '' : parsePrettyToDate(m.entrada)); document.getElementById('exitDateLeave')._flatpickr.setDate(new Date()); document.getElementById('exitReason').value = ""; showModal('exitModal', 'exitModalContent'); }

function saveEdit() {
    const nick = document.getElementById('editNick').value.trim(); if (!nick) { showToast('Nickname obrigatório', 'error'); return; }
    const rawLic = document.getElementById('editLicInicio').value, isRL = document.getElementById('editRL').checked;
    const data = { nickname: nick, cargo: document.getElementById('editCargo').value, entrada: formatDatePretty(document.getElementById('editEntrada').value) || '-', promocao: formatDatePretty(document.getElementById('editPromocao').value) || '-', licenca: { inicio: formatDatePretty(rawLic) || '-', dias: document.getElementById('editLicDias').value || '', termino: '-', isRL }, status: (rawLic || isRL) ? 'leave' : 'active' };
    
    const cleanNick = nick.replace(/^@/, '').toLowerCase();
    
    if (isAddingNew) { 
        allMembers.push(data); 
        showToast(`${nick} adicionado`, 'success'); 
        checkUserInGroup(nick).then(() => renderList()); 
        // If adding new member with RL, track it
        if (isRL) {
            rlAddedToday.add(cleanNick);
        }
    }
    else if (currentEditingIndex > -1) { 
        const old = allMembers[currentEditingIndex];
        const oldNick = old.nickname.replace(/^@/, '').toLowerCase();
        const wasRL = old.licenca.isRL;
        
        allMembers[currentEditingIndex] = data; 
        showToast(`${nick} atualizado`, 'success'); 
        
        // Handle RL tracking
        if (!wasRL && isRL) {
            // Newly set to RL
            rlAddedToday.add(cleanNick);
        } else if (wasRL && !isRL) {
            // Removed from RL
            rlAddedToday.delete(oldNick);
        }
        
        if (old.nickname !== nick) { 
            delete groupStatusCache[old.nickname.replace(/^@/, '').trim()]; 
            rlAddedToday.delete(oldNick);
            if (isRL) rlAddedToday.add(cleanNick);
            checkUserInGroup(nick).then(() => renderList()); 
        } 
    }
    sortMembers(); syncData(); closeModal();
}

function openFinalModal(bbcode) { document.getElementById('bbcodeOutput').value = bbcode; showModalGeneric('finalModal'); }
function closeFinalModal() { closeModalGeneric('finalModal'); }
function copyBBCode() { document.getElementById('bbcodeOutput').select(); document.execCommand('copy'); showToast('BBCode copiado!', 'success'); }
