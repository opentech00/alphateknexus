GRANT EXECUTE ON FUNCTION public.generate_email_verification_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_email_verification_code(text, text) TO service_role;