import { Modal, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type Dashboard from '../main';
import { ensurePlan, isoWeek, planInfo } from '../data/planning';
import type { PlanPeriod } from '../data/planning';
import { createLongTermPlan, activeLongTermPlans, longTermPlanPath } from '../data/longTermPlans';
import type { LongTermPlan, NewLongTermPlan } from '../data/longTermPlans';
import { longTermPlanFiles, scanLongTermPlans, setProcessLongTermPlan } from '../data/longTermPlanVault';
import { scanLearning } from '../data/learningVault';
import { scanProjects } from '../data/projectVault';
import { processes } from '../data/processes';
import { projectPath } from '../data/projects';
import { todayStr } from '../data/taskLogic';
import { beginListModal, closeListModal } from './viewPrimitives';

type PlanCreateType = PlanPeriod | 'long';
const LABELS: Array<[PlanCreateType, string]> = [['year','年计划'],['quarter','季计划'],['month','月计划'],['week','周计划'],['long','长计划']];
function isoWeekDate(year: number, week: number): Date {
	const jan4 = new Date(year, 0, 4, 12); const monday = new Date(jan4); monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7); return monday;
}
export class PlanModal extends Modal {
	private type: PlanCreateType = 'year'; private plans: LongTermPlan[] = []; private selectedIds = new Set<string>(); private saving = false;
	constructor(app: App, private plugin: Dashboard, private selection: { year: number; month: number }) { super(app); }
	onOpen(): void { void scanLongTermPlans(this.app).then(plans => { this.plans = activeLongTermPlans(plans); this.render(); }); this.render(); }
	private render(): void {
		const el = beginListModal(this, '新建计划');
		el.createEl('label', { cls: 'ad-modal-label', text: '计划类型' }); const types = el.createDiv({ cls: 'ad-prio-group', attr: { role: 'group', 'aria-label': '计划类型' } });
		for (const [type,label] of LABELS) { const button = types.createEl('button', { cls: `ad-prio-btn${this.type === type ? ' is-selected' : ''}`, text: label, attr: { type:'button' } }); button.onclick = () => { this.type = type; this.render(); }; }
		const fields: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = {};
		const field = (key:string,label:string,type='text') => { el.createEl('label',{cls:'ad-modal-label',text:label}); const input = type === 'textarea' ? el.createEl('textarea',{cls:'ad-modal-input',attr:{rows:'3','aria-label':label}}) : el.createEl('input',{cls:'ad-modal-input',attr:{type,'aria-label':label}}); fields[key]=input; return input; };
		if (this.type === 'long') {
			field('name','名称'); const start=field('start','开始月份','month'); start.value=`${this.selection.year}-${String(this.selection.month).padStart(2,'0')}`; const end=field('end','结束月份','month'); end.value=start.value;
			el.createEl('label',{cls:'ad-modal-label',text:'状态'}); const status=el.createEl('select',{cls:'ad-modal-input'}); fields.status=status; for(const value of ['计划中','进行中','暂停','已完成','归档']) status.createEl('option',{value,text:value});
			field('goal','长期目标（可选）','textarea');
			const all = processes(scanLearning(this.app), scanProjects(this.app), this.plugin.embeddedTasks.all());
			if (all.length) { el.createEl('label',{cls:'ad-modal-label',text:'关联进程（可选）'}); const select=el.createEl('select',{cls:'ad-modal-input',attr:{multiple:'true',size:String(Math.min(5,all.length))}}); fields.processes=select; for(const process of all) select.createEl('option',{value:process.sourceFile,text:`[${process.category==='learning'?'学习':'创作'}] ${process.name}${process.direction?` · ${process.direction}`:''}`}); }
		} else {
			if (this.type === 'year') { const value=field('year','年份','number'); value.value=String(this.selection.year); }
			if (this.type === 'quarter') { const year=field('year','年份','number'); year.value=String(this.selection.year); el.createEl('label',{cls:'ad-modal-label',text:'季度'}); const quarter=el.createEl('select',{cls:'ad-modal-input'}); fields.quarter=quarter; for(let q=1;q<=4;q++) quarter.createEl('option',{value:String(q),text:`Q${q}`}); quarter.value=String(Math.floor((this.selection.month-1)/3)+1); }
			if (this.type === 'month') { const month=field('month','月份','month'); month.value=`${this.selection.year}-${String(this.selection.month).padStart(2,'0')}`; }
			if (this.type === 'week') { const week=field('week','ISO 年与周','week'); const iso=isoWeek(new Date(this.selection.year,this.selection.month-1,1,12)); week.value=`${iso.year}-W${String(iso.week).padStart(2,'0')}`; }
			if (this.plans.length) { el.createEl('label',{cls:'ad-modal-label',text:'关联长期计划（可选，可多选）'}); for(const plan of this.plans) { const label=el.createEl('label',{cls:'ad-modal-check'}); const box=label.createEl('input',{cls:'ad-modal-checkbox',attr:{type:'checkbox'}}); box.checked=this.selectedIds.has(plan.id); box.onchange=()=>box.checked?this.selectedIds.add(plan.id):this.selectedIds.delete(plan.id); label.createSpan({cls:'ad-modal-check-label',text:plan.name}); } }
		}
		const footer=el.createDiv({cls:'ad-modal-btns'}); footer.createEl('button',{cls:'ad-modal-btn',text:'取消'}).onclick=()=>this.close(); const create=footer.createEl('button',{cls:'ad-modal-btn ad-modal-btn--primary',text:'创建计划'}); create.onclick=()=>void this.save(fields,create);
	}
	private async save(fields: Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, button: HTMLButtonElement): Promise<void> {
		if(this.saving)return; this.saving=true; button.disabled=true;
		try {
			const files=longTermPlanFiles(this.app); let path='';
			if(this.type==='long'){
				const name=fields.name!.value.trim(); const info=longTermPlanPath(name);
				if(files.kind(info.path)==='file') { path=info.path; new Notice('该长计划已存在，已打开现有计划'); }
				else {
					const sameProject=scanProjects(this.app).find(project=>project.path===projectPath(name).path);
					if(sameProject) throw new Error('检测到同名创作项目。请先确认是否需要将其转为长期计划。');
					const input:NewLongTermPlan={name,status:fields.status!.value as NewLongTermPlan['status'],startMonth:fields.start!.value,endMonth:fields.end!.value,goal:fields.goal!.value};
					const id=crypto.randomUUID(); path=await createLongTermPlan(files,input,id,todayStr());
					const selected=fields.processes instanceof HTMLSelectElement ? Array.from(fields.processes.selectedOptions).map(option=>option.value) : [];
					const all=processes(scanLearning(this.app),scanProjects(this.app),this.plugin.embeddedTasks.all()); await Promise.all(all.filter(process=>selected.includes(process.sourceFile)).map(process=>setProcessLongTermPlan(this.app,process,id)));
				}
			} else {
				let date:Date;
				if(this.type==='year') date=new Date(Number(fields.year!.value),0,1,12);
				else if(this.type==='quarter') date=new Date(Number(fields.year!.value),(Number(fields.quarter!.value)-1)*3,1,12);
				else if(this.type==='month'){const [year,month]=fields.month!.value.split('-').map(Number);date=new Date(year!,month!-1,1,12);}
				else {const match=/^(\d{4})-W(\d{2})$/.exec(fields.week!.value);if(!match)throw new Error('请选择有效周');date=isoWeekDate(Number(match[1]),Number(match[2]));}
				const info=planInfo(this.type,date); if(files.kind(info.path)==='file'){path=info.path;new Notice(`该${LABELS.find(([type])=>type===this.type)?.[1]}已存在，已打开现有计划`);} else path=await ensurePlan(files,this.type,date,[...this.selectedIds]);
			}
			const file=this.app.vault.getAbstractFileByPath(path); this.close(); if(file instanceof TFile) await this.app.workspace.getLeaf('tab').openFile(file);
		}catch(error){new Notice(String(error));}finally{this.saving=false;button.disabled=false;}
	}
	onClose():void{closeListModal(this);}
}
