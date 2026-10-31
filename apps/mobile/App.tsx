import { useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { createApiClient, ApiClientError } from '@sahana/api-client';
import { isLocale, SUPPORTED_LOCALES, translate, type Locale } from '@sahana/i18n';
import { color, fontSize, lineHeight, space } from '@sahana/design-tokens';
import type { LoginResponse } from '@sahana/types';
import { Button, TextField } from '@sahana/ui-mobile';

const REFRESH_KEY = 'sahana.refresh';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requestType, setRequestType] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [statusCode, setStatusCode] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [idempotencyKey] = useState(() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  const t = (key: string) => translate(locale, key);

  const client = createApiClient({
    baseUrl: apiUrl,
    getAccessToken: () => accessToken,
  });

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const result = await client.request<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, client: 'mobile' }),
      });
      if (!result.refreshToken || !result.accessToken) {
        setError(t('errors.generic'));
        return;
      }
      await SecureStore.setItemAsync(REFRESH_KEY, result.refreshToken);
      setAccessToken(result.accessToken);
      setDisplayName(result.user.displayName);
      if (isLocale(result.user.preferredLanguage)) setLocale(result.user.preferredLanguage);
      try {
        const mine = await createApiClient({
          baseUrl: apiUrl,
          getAccessToken: () => result.accessToken ?? null,
        }).request<{ id: string }>('/api/v1/members/me');
        setMemberId(mine.id);
      } catch (caught) {
        if (!(caught instanceof ApiClientError) || caught.status !== 404) {
          setMemberId(null);
        }
      }
    } catch (caught) {
      if (caught instanceof ApiClientError) setError(t(caught.body.messageKey ?? 'auth.signIn.failed'));
      else setError(t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function submitEmergency() {
    if (!accessToken) return;
    setPending(true);
    setError(null);
    try {
      let linked = memberId;
      if (!linked) {
        const created = await client.request<{ id: string }>('/api/v1/members', {
          method: 'POST',
          body: JSON.stringify({
            memberNo,
            givenName,
            familyName,
            statusCode,
            categoryCode,
            linkToCurrentUser: true,
          }),
        });
        linked = created.id;
        setMemberId(created.id);
      }
      await client.request('/api/v1/emergency-requests', {
        method: 'POST',
        body: JSON.stringify({
          memberId: linked,
          requestType,
          phone,
          description,
          idempotencyKey,
        }),
      });
      setSubmitted(true);
    } catch (caught) {
      if (caught instanceof ApiClientError) setError(t(caught.body.messageKey ?? 'errors.generic'));
      else setError(t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setAccessToken(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: fontSize.body, fontWeight: '700', color: color.text }}>{t('common.appName')}</Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {SUPPORTED_LOCALES.map((code) => (
              <Text
                key={code}
                accessibilityRole="button"
                onPress={() => setLocale(code)}
                style={{
                  color: locale === code ? color.primaryInk : color.body,
                  fontSize: fontSize.dense,
                  lineHeight: fontSize.dense * lineHeight.body,
                  paddingVertical: space[2],
                }}
              >
                {t(`common.language.${code}`)}
              </Text>
            ))}
          </View>
        </View>
        {accessToken ? (
          <View style={{ gap: space[4] }}>
            <Text style={{ fontSize: fontSize.body, color: color.text }}>{displayName}</Text>
            <Text style={{ color: color.text, fontSize: fontSize.dense, lineHeight: fontSize.dense * lineHeight.body }}>
              {t('shell.emergency.notASubstitute')}
            </Text>
            {submitted ? (
              <Text style={{ color: color.success, fontSize: fontSize.body }}>{t('modules.saved')}</Text>
            ) : (
              <View style={{ gap: space[3] }}>
                <Text style={{ color: color.text, fontWeight: '700', fontSize: fontSize.body }}>{t('shell.emergency.title')}</Text>
                {memberId ? null : (
                  <>
                    <TextField label={t('modules.field.memberNo')} value={memberNo} onChangeText={setMemberNo} />
                    <TextField label={t('modules.field.givenName')} value={givenName} onChangeText={setGivenName} />
                    <TextField label={t('modules.field.familyName')} value={familyName} onChangeText={setFamilyName} />
                    <TextField label={t('modules.field.statusCode')} value={statusCode} onChangeText={setStatusCode} />
                    <TextField label={t('modules.field.categoryCode')} value={categoryCode} onChangeText={setCategoryCode} />
                  </>
                )}
                <TextField label={t('modules.field.requestType')} value={requestType} onChangeText={setRequestType} />
                <TextField label={t('modules.field.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <TextField label={t('modules.field.description')} value={description} onChangeText={setDescription} />
                {error ? <Text style={{ color: color.dangerInk }}>{error}</Text> : null}
                <Button label={t('common.action.save')} loading={pending} onPress={() => void submitEmergency()} />
              </View>
            )}
            <Button label={t('common.action.signOut')} onPress={() => void signOut()} />
          </View>
        ) : (
          <View style={{ gap: space[3] }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: color.text }}>{t('auth.signIn.title')}</Text>
            <TextField
              label={t('auth.signIn.email')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label={t('auth.signIn.password')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={{ color: color.dangerInk }}>{error}</Text> : null}
            <Button label={t('auth.signIn.submit')} loading={pending} onPress={() => void signIn()} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
