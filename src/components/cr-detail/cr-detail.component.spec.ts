import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	it('shows the timeline oldest-first', async () => {
		const fixture = await render(users.approver, 'CR-1');

		const elements = fixture.nativeElement.querySelectorAll('.cr-timeline__action');
		const actions = Array.from(elements).map((el: any) => el.textContent.trim());

		expect(actions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('shows a read-only message and no reject form to a viewer', async () => {
		const fixture = await render(users.viewer, 'CR-1');

		expect(fixture.nativeElement.querySelector('.cr-actions__none').textContent).toContain('read-only');
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('approves a pending CR and shows the new status', async () => {
		const fixture = await render(users.approver, 'CR-1');

		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush(); // wait for the fake API
		fixture.detectChanges(); // re-render with the result

		expect(fixture.nativeElement.querySelector('.cr-status').textContent.trim()).toBe('APPROVED');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(true);
	});

	it('shows an error and keeps the CR pending when Approve fails', async () => {
		const fixture = await render(users.approver, 'CR-1');
		TestBed.inject(CrApiService).failNext = true; // the next API call will fail

		fixture.nativeElement.querySelector('.cr-actions__approve').click();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain("Couldn't approve");
		expect(fixture.nativeElement.querySelector('.cr-status').textContent.trim()).toBe('PENDING_APPROVAL');
		expect(fixture.nativeElement.querySelector('.cr-actions__approve').disabled).toBe(false);
	});

	it('keeps Reject disabled until a real reason is entered', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const rejectBtn = fixture.nativeElement.querySelector('.cr-actions__reject-btn');

		expect(rejectBtn.disabled).toBe(true); // empty box

		fixture.componentInstance.rejectControl.setValue('   '); // only spaces
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(true);

		fixture.componentInstance.rejectControl.setValue('Price not agreed');
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(false);
	});

	it('disables Approve while a slow request is in flight and sends only one request', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const api = TestBed.inject(CrApiService);
		api.latencyMs = 50;
		const spy = jest.spyOn(api, 'approve');
		const approveBtn = fixture.nativeElement.querySelector('.cr-actions__approve');

		approveBtn.click();
		fixture.detectChanges();
		expect(approveBtn.disabled).toBe(true);
		expect(approveBtn.textContent.trim()).toBe('Approving…');

		void fixture.componentInstance.approve();
		await wait(60);
		fixture.detectChanges();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent.trim()).toBe('APPROVED');
	});
});
