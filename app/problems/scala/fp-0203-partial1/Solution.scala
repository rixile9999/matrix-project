def partial1[A, B, C](a: A, f: (A, B) => C): B => C =
  b => f(a, b)

val greet: String => String =
  partial1("Hello, ", (p: String, n: String) => p + n)
