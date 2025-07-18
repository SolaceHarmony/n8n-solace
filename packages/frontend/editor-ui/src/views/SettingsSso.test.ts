import type { OidcConfigDto, SamlPreferences } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import { within, waitFor } from '@testing-library/vue';
import { mockedStore, retry } from '@/__tests__/utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsSso from '@/views/SettingsSso.vue';
import { setupServer } from '@/__tests__/server';
import { useSettingsStore } from '@/stores/settings.store';
import userEvent from '@testing-library/user-event';
import { useSSOStore } from '@/stores/sso.store';
import { createComponentRenderer } from '@/__tests__/render';
import { nextTick } from 'vue';
import { usePageRedirectionHelper } from '@/composables/usePageRedirectionHelper';
import type { SamlPreferencesExtractedData } from '@n8n/rest-api-client/api/sso';

const renderView = createComponentRenderer(SettingsSso);

const samlConfig = {
	metadata: 'metadata dummy',
	metadataUrl:
		'https://dev-qqkrykgkoo0p63d5.eu.auth0.com/samlp/metadata/KR1cSrRrxaZT2gV8ZhPAUIUHtEY4duhN',
	entityID: 'https://n8n-tunnel.myhost.com/rest/sso/saml/metadata',
	returnUrl: 'https://n8n-tunnel.myhost.com/rest/sso/saml/acs',
} as SamlPreferences & SamlPreferencesExtractedData;

const oidcConfig = {
	discoveryEndpoint: 'https://dev-qqkrykgkoo0p63d5.eu.auth0.com/.well-known/openid-configuration',
} as OidcConfigDto;

const telemetryTrack = vi.fn();
vi.mock('@/composables/useTelemetry', () => ({
	useTelemetry: () => ({
		track: telemetryTrack,
	}),
}));

const showError = vi.fn();
vi.mock('@/composables/useToast', () => ({
	useToast: () => ({
		showError,
	}),
}));

const confirmMessage = vi.fn();
vi.mock('@/composables/useMessage', () => ({
	useMessage: () => ({
		confirm: confirmMessage,
	}),
}));

vi.mock('@/composables/usePageRedirectionHelper', () => {
	const goToUpgrade = vi.fn();
	return {
		usePageRedirectionHelper: () => ({
			goToUpgrade,
		}),
	};
});

describe('SettingsSso View', () => {
	beforeEach(() => {
		telemetryTrack.mockReset();
		confirmMessage.mockReset();
		showError.mockReset();
	});

	it('should show upgrade banner when enterprise SAML is disabled', async () => {
		const pinia = createTestingPinia();
		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = false;
		ssoStore.isEnterpriseOidcEnabled = false;

		const pageRedirectionHelper = usePageRedirectionHelper();

		const { getByTestId } = renderView({ pinia });

		const actionBox = getByTestId('sso-content-unlicensed');
		expect(actionBox).toBeInTheDocument();

		await userEvent.click(await within(actionBox).findByText('See plans'));
		expect(pageRedirectionHelper.goToUpgrade).toHaveBeenCalledWith('sso', 'upgrade-sso');
	});

	it('should show user SSO config', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;

		ssoStore.getSamlConfig.mockResolvedValue(samlConfig);

		const { getAllByTestId } = renderView({ pinia });

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(1);

		await waitFor(async () => {
			const copyInputs = getAllByTestId('copy-input');
			expect(copyInputs[0].textContent).toContain(samlConfig.returnUrl);
			expect(copyInputs[1].textContent).toContain(samlConfig.entityID);
		});
	});

	it('allows user to toggle SSO', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isSamlLoginEnabled = false;
		ssoStore.isEnterpriseOidcEnabled = true;

		ssoStore.getSamlConfig.mockResolvedValue(samlConfig);

		const { getByTestId } = renderView({ pinia });

		const toggle = getByTestId('sso-toggle');

		expect(toggle.textContent).toContain('Deactivated');

		await userEvent.click(toggle);
		expect(toggle.textContent).toContain('Activated');

		await userEvent.click(toggle);
		expect(toggle.textContent).toContain('Deactivated');
	});

	it("allows user to fill Identity Provider's URL", async () => {
		confirmMessage.mockResolvedValueOnce('confirm');

		const pinia = createTestingPinia();
		const windowOpenSpy = vi.spyOn(window, 'open');

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;

		const { getByTestId } = renderView({ pinia });

		const saveButton = getByTestId('sso-save');
		expect(saveButton).toBeDisabled();

		const urlinput = getByTestId('sso-provider-url');

		expect(urlinput).toBeVisible();
		await userEvent.type(urlinput, samlConfig.metadataUrl!);

		expect(saveButton).not.toBeDisabled();
		await userEvent.click(saveButton);

		expect(ssoStore.saveSamlConfig).toHaveBeenCalledWith(
			expect.objectContaining({ metadataUrl: samlConfig.metadataUrl }),
		);

		expect(ssoStore.testSamlConfig).toHaveBeenCalled();
		expect(windowOpenSpy).toHaveBeenCalled();

		expect(telemetryTrack).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ identity_provider: 'metadata', authentication_method: 'saml' }),
		);

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(2);
	});

	it("allows user to fill Identity Provider's XML", async () => {
		confirmMessage.mockResolvedValueOnce('confirm');

		const pinia = createTestingPinia();
		const windowOpenSpy = vi.spyOn(window, 'open');

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;

		const { getByTestId } = renderView({ pinia });

		const saveButton = getByTestId('sso-save');
		expect(saveButton).toBeDisabled();

		await userEvent.click(getByTestId('radio-button-xml'));

		const xmlInput = getByTestId('sso-provider-xml');

		expect(xmlInput).toBeVisible();
		await userEvent.type(xmlInput, samlConfig.metadata!);

		expect(saveButton).not.toBeDisabled();
		await userEvent.click(saveButton);

		expect(ssoStore.saveSamlConfig).toHaveBeenCalledWith(
			expect.objectContaining({ metadata: samlConfig.metadata }),
		);

		expect(ssoStore.testSamlConfig).toHaveBeenCalled();
		expect(windowOpenSpy).toHaveBeenCalled();

		expect(telemetryTrack).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ identity_provider: 'xml' }),
		);

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(2);
	});

	it('should validate the url before setting the saml config', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;

		const { getByTestId } = renderView({ pinia });

		const saveButton = getByTestId('sso-save');
		expect(saveButton).toBeDisabled();

		const urlinput = getByTestId('sso-provider-url');

		expect(urlinput).toBeVisible();
		await userEvent.type(urlinput, samlConfig.metadata!);

		expect(saveButton).not.toBeDisabled();
		await userEvent.click(saveButton);

		expect(showError).toHaveBeenCalled();
		expect(ssoStore.saveSamlConfig).not.toHaveBeenCalled();

		expect(ssoStore.testSamlConfig).not.toHaveBeenCalled();

		expect(telemetryTrack).not.toHaveBeenCalled();

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(2);
	});

	it('should ensure the url does not support invalid protocols like mailto', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;

		const { getByTestId } = renderView({ pinia });

		const saveButton = getByTestId('sso-save');
		expect(saveButton).toBeDisabled();

		const urlinput = getByTestId('sso-provider-url');

		expect(urlinput).toBeVisible();
		await userEvent.type(urlinput, 'mailto://test@example.com');

		expect(saveButton).not.toBeDisabled();
		await userEvent.click(saveButton);

		expect(showError).toHaveBeenCalled();
		expect(ssoStore.saveSamlConfig).not.toHaveBeenCalled();

		expect(ssoStore.testSamlConfig).not.toHaveBeenCalled();

		expect(telemetryTrack).not.toHaveBeenCalled();

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(2);
	});

	it('allows user to disable SSO even if config request failed', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.isEnterpriseSamlEnabled = true;
		ssoStore.isSamlLoginEnabled = true;
		ssoStore.isEnterpriseOidcEnabled = true;
		ssoStore.isOidcLoginEnabled = false;

		const error = new Error('Request failed with status code 404');
		ssoStore.getSamlConfig.mockRejectedValue(error);

		const { getByTestId } = renderView({ pinia });

		expect(ssoStore.getSamlConfig).toHaveBeenCalledTimes(1);

		await waitFor(async () => {
			expect(showError).toHaveBeenCalledWith(error, 'error');
			const toggle = getByTestId('sso-toggle');
			expect(toggle.textContent).toContain('Activated');
			await userEvent.click(toggle);
			expect(toggle.textContent).toContain('Deactivated');
		});
	});

	it('allows user to save OIDC config', async () => {
		const pinia = createTestingPinia();

		const ssoStore = mockedStore(useSSOStore);
		ssoStore.saveOidcConfig.mockResolvedValue(oidcConfig);
		ssoStore.isEnterpriseOidcEnabled = true;
		ssoStore.isEnterpriseSamlEnabled = false;
		ssoStore.isOidcLoginEnabled = true;
		ssoStore.isSamlLoginEnabled = false;

		const { getByTestId, getByRole } = renderView({ pinia });

		// Set authProtocol component ref to OIDC
		const protocolSelect = getByRole('combobox');
		expect(protocolSelect).toBeInTheDocument();
		await userEvent.click(protocolSelect);

		const dropdown = await waitFor(() => getByRole('listbox'));
		expect(dropdown).toBeInTheDocument();
		const items = dropdown.querySelectorAll('.el-select-dropdown__item');
		const oidcItem = Array.from(items).find((item) => item.textContent?.includes('OIDC'));
		expect(oidcItem).toBeDefined();

		await userEvent.click(oidcItem!);

		const saveButton = await waitFor(() => getByTestId('sso-oidc-save'));
		expect(saveButton).toBeVisible();

		const oidcDiscoveryUrlInput = getByTestId('oidc-discovery-endpoint');

		expect(oidcDiscoveryUrlInput).toBeVisible();
		await userEvent.type(oidcDiscoveryUrlInput, oidcConfig.discoveryEndpoint);

		const clientIdInput = getByTestId('oidc-client-id');
		expect(clientIdInput).toBeVisible();
		await userEvent.type(clientIdInput, 'test-client-id');
		const clientSecretInput = getByTestId('oidc-client-secret');
		expect(clientSecretInput).toBeVisible();
		await userEvent.type(clientSecretInput, 'test-client-secret');

		expect(saveButton).not.toBeDisabled();
		await userEvent.click(saveButton);

		expect(ssoStore.saveOidcConfig).toHaveBeenCalledWith(
			expect.objectContaining({
				discoveryEndpoint: oidcConfig.discoveryEndpoint,
				clientId: 'test-client-id',
				clientSecret: 'test-client-secret',
				loginEnabled: true,
			}),
		);

		expect(telemetryTrack).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				authentication_method: 'oidc',
				discovery_endpoint: oidcConfig.discoveryEndpoint,
				is_active: true,
			}),
		);
	});
});

let pinia: ReturnType<typeof createPinia>;
let ssoStore: ReturnType<typeof useSSOStore>;
let settingsStore: ReturnType<typeof useSettingsStore>;
let server: ReturnType<typeof setupServer>;

const renderComponent = createComponentRenderer(SettingsSso);

describe('SettingsSso', () => {
	beforeAll(() => {
		server = setupServer();
	});

	beforeEach(async () => {
		window.open = vi.fn();

		pinia = createPinia();
		setActivePinia(pinia);

		ssoStore = useSSOStore();
		settingsStore = useSettingsStore();

		await settingsStore.getSettings();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	afterAll(() => {
		server.shutdown();
	});

	it('should render paywall state when there is no license', () => {
		const { getByTestId, queryByTestId, queryByRole } = renderComponent({
			pinia,
		});

		expect(queryByRole('checkbox')).not.toBeInTheDocument();
		expect(queryByTestId('sso-content-licensed')).not.toBeInTheDocument();
		expect(getByTestId('sso-content-unlicensed')).toBeInTheDocument();
	});

	it('should render licensed content', async () => {
		ssoStore.isEnterpriseSamlEnabled = true;
		await nextTick();

		const { getByTestId, queryByTestId, getByRole } = renderComponent({
			pinia,
		});

		expect(getByRole('switch')).toBeInTheDocument();
		expect(getByTestId('sso-content-licensed')).toBeInTheDocument();
		expect(queryByTestId('sso-content-unlicensed')).not.toBeInTheDocument();
	});

	it('should enable activation checkbox and test button if data is already saved', async () => {
		await ssoStore.getSamlConfig();
		ssoStore.isEnterpriseSamlEnabled = true;
		await nextTick();

		const { container, getByTestId, getByRole } = renderComponent({
			pinia,
		});

		const xmlRadioButton = getByTestId('radio-button-xml');
		await userEvent.click(xmlRadioButton);

		await retry(() =>
			expect(container.querySelector('textarea[name="metadata"]')).toHaveValue(
				'<?xml version="1.0"?>',
			),
		);

		expect(getByRole('switch')).toBeEnabled();
		expect(getByTestId('sso-test')).toBeEnabled();
	});
});
