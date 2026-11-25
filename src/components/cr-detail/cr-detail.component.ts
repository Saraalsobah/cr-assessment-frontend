import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the chronological approval
 * timeline, and permission-aware Approve/Reject actions (with reject-reason validation). Emits
 * `changed` after a successful action so the parent can refresh the list.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges {
	@Input() id!: string;
	@Output() changed = new EventEmitter<void>();

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	rejectControl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] });

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	ngOnChanges(changes: SimpleChanges): void {
		const idChange = changes['id'];
		if (idChange && !idChange.firstChange) {
			this.actionError = undefined;
			this.rejectControl.reset('');
			void this.load();
		}
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		const audit = this.detail?.audit ?? [];

		const copy = [...audit];
		return copy.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	}

	/** Whether the current user may approve the loaded CR: it must be pending AND the user needs an approve policy. */
	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.canApprove;
	}

	/** Why no actions are available, or null if the user can act. */
	get noActionReason(): string | null {
		if (!this.detail || this.canApprove) return null;

		if (this.detail.status !== 'PENDING_APPROVAL') return `No actions available: this change request is ${this.detail.status}.`;
		return 'You have read-only access to this change request.';
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) return;
		this.submitting = true;
		this.actionError = undefined;
		try {
			const detail = await this.api.approve(this.session.user, this.id, new Date().toISOString());
			this.state = { status: 'loaded', data: detail };
			this.changed.emit();
		} catch (err) {
			this.actionError = `Couldn't approve this change request: ${(err as Error).message}`;
		} finally {
			this.submitting = false;
		}
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return;

		if (this.rejectControl.invalid) {
			this.rejectControl.markAsTouched();
			return;
		}
		const reason = this.rejectControl.value.trim();

		this.submitting = true;
		this.actionError = undefined;

		try {
			const detail = await this.api.reject(this.session.user, this.id, new Date().toISOString(), reason);
			this.state = { status: 'loaded', data: detail };
			this.rejectControl.reset('');
			this.changed.emit();
		} catch (err) {
			this.actionError = `Couldn't reject this change request: ${(err as Error).message}`;
		} finally {
			this.submitting = false;
		}
	}
}
