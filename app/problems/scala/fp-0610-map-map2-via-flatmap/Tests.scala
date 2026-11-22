case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  val v = Vector(1, 2, 3)
  Judge.check("mapViaFlatMap: 값 변환과 RNG")(mapViaFlatMap(int)(_ * 10)(ScriptRNG(v)), (10, ScriptRNG(v, 1)))
  Judge.check("mapViaFlatMap: unit")(mapViaFlatMap(unit(4))(_ + 1)(ScriptRNG(v)), (5, ScriptRNG(v)))
  Judge.check("map2ViaFlatMap: 첫 인자가 먼저")(map2ViaFlatMap(int, int)((a, b) => (a, b))(ScriptRNG(v)), ((1, 2), ScriptRNG(v, 2)))
  Judge.check("map2ViaFlatMap: 순서에 민감한 f")(map2ViaFlatMap(int, int)(_ - _)(scriptRng(10, 3))._1, 7)
  Judge.check("map2ViaFlatMap: unit 은 RNG 를 소비하지 않는다")(map2ViaFlatMap(unit(1), int)(_ + _)(ScriptRNG(v)), (2, ScriptRNG(v, 1)))
  Judge.check("map2ViaFlatMap: SimpleRNG")(map2ViaFlatMap(int, int)(_ + _)(SimpleRNG(1)), { val (a, r1) = SimpleRNG(1).nextInt; val (b, r2) = r1.nextInt; (a + b, r2) })
