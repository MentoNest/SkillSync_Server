it('renders template and sends email', async () => {
  const adapter = { send: jest.fn() };
  const templates = {
    render: jest.fn().mockReturnValue('<html />'),
  };

  const service = new EmailService(
    adapter as any,
    templates as any,
  );

  await service.sendEmail({
    to: 'test@mail.com',
    subject: 'Hello',
    template: 'booking-confirmed',
    data: { name: 'MD' },
  });

  expect(adapter.send).toHaveBeenCalled();
});
