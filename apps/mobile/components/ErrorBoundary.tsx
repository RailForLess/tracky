import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type ColorPalette, BorderRadius, Spacing } from '../constants/theme';
import { useColors } from '../context/ThemeContext';
import { error as logError, openCrashReportEmail } from '../utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onDismiss?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

function ErrorFallback({
  error,
  componentStack,
  onReload,
}: {
  error: Error | null;
  componentStack: string | null;
  onReload: () => void;
}) {
  const colors = useColors();

  const handleReport = () => {
    openCrashReportEmail(error, componentStack);
  };

  return (
    <View style={[errorStyles.container, { backgroundColor: colors.background.primary }]}>
      <View style={errorStyles.content}>
        <Ionicons name="bug-outline" size={48} color={colors.secondary} />
        <Text style={[errorStyles.title, { color: colors.primary }]}>Something went wrong</Text>
        <Text style={[errorStyles.message, { color: colors.secondary }]}>
          {error?.message || 'An unexpected error occurred'}
        </Text>
        <TouchableOpacity style={[errorStyles.button, { backgroundColor: colors.background.tertiary }]} onPress={onReload}>
          <Ionicons name="refresh" size={18} color={colors.primary} />
          <Text style={[errorStyles.buttonText, { color: colors.primary }]}>Reload App</Text>
        </TouchableOpacity>
        <TouchableOpacity style={errorStyles.reportButton} onPress={handleReport}>
          <Ionicons name="mail-outline" size={16} color={colors.secondary} />
          <Text style={[errorStyles.reportButtonText, { color: colors.secondary }]}>Report Issue</Text>
        </TouchableOpacity>
      </View>
      <Text style={[errorStyles.copyright, { color: colors.secondary }]}>Tracky - Made with &lt;3 by Jason</Text>
    </View>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError('ErrorBoundary caught: ' + error?.message, { error, componentStack: errorInfo.componentStack });
    this.setState({ componentStack: errorInfo.componentStack ?? null });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, componentStack: null });
    this.props.onDismiss?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.lg,
  },
  message: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xl,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  reportButtonText: {
    fontSize: 13,
  },
  copyright: {
    position: 'absolute',
    bottom: '15%',
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.6,
  },
});
