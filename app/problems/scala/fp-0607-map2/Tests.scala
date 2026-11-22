case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(1, 2, 3)
  Judge.check("map2: 첫 인자가 먼저, RNG 두 번 전진")(map2(int, int)((a, b) => (a, b))(ScriptRNG(v)), ((1, 2), ScriptRNG(v, 2)))
  Judge.check("map2: 순서에 민감한 f")(map2(int, int)(_ - _)(scriptRng(10, 3))._1, 7)
  Judge.check("map2: unit 은 RNG 를 소비하지 않는다")(map2(unit(1), unit("x"))((a, b) => s"$a$b")(ScriptRNG(v)), ("1x", ScriptRNG(v)))
  val a = Vector(-5, 1073741824)
  val b = Vector(1073741824, -5)
  Judge.check("randIntDouble")(randIntDouble(ScriptRNG(a)), ((-5, 0.5), ScriptRNG(a, 2)))
  Judge.check("randDoubleInt")(randDoubleInt(ScriptRNG(b)), ((0.5, -5), ScriptRNG(b, 2)))
  val r = SimpleRNG(42)
  val (i, r1) = r.nextInt
  val (d, r2) = randDouble(r1)
  Judge.check("SimpleRNG 에서 randIntDouble")(randIntDouble(r), ((i, d), r2))
